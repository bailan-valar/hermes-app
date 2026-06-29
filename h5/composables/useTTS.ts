/**
 * useTTS — shared reactive wrapper around the browser SpeechSynthesis API
 * (text-to-speech). The counterpart to `useSpeech` (recognition).
 *
 * Unlike `useSpeech`, playback state lives in `useState` (shared app-wide):
 * speech synthesis is inherently single-voice / mutually exclusive — only one
 * utterance may play at a time — and the "currently-speaking message" must be
 * reflected consistently across every MessageBubble. The engine itself (voice
 * cache, segment queue) is module-scoped on the client.
 *
 * Robustness:
 * - SSR-safe: guarded behind `import.meta.client`; `supported` resolves in
 *   onMounted so server/client render match (no hydration mismatch).
 * - Voices load asynchronously — cached on first availability and on the
 *   `voiceschanged` event, then a zh voice is picked.
 * - Chrome cuts long utterances (~15s). We side-step that without the
 *   pause/resume keep-alive hack (which misbehaves on Safari) by segmenting the
 *   text into sentence-sized chunks and queueing them back-to-back.
 * - lib.dom already types SpeechSynthesis* — no local declarations needed.
 */
const DEFAULT_LANG = 'zh-CN'
// Hard cap per segment (characters) so a single very long sentence can't trip
// the engine's internal cutoff. ~180 chars stays well under the time limit.
const MAX_SEGMENT_CHARS = 180

export interface TtsSettings {
  /** Speech rate. Clamped to [0.5, 2] when applied (1 = normal). */
  rate: number
  /** Pitch. Clamped to [0, 2] when applied (1 = normal). */
  pitch: number
  /** Volume. Clamped to [0, 1] when applied (1 = loudest). */
  volume: number
  /** Voice to use, by SpeechSynthesisVoice.voiceURI. null = auto-pick zh voice. */
  voiceURI: string | null
  /** Auto-speak each assistant reply as soon as it finishes streaming. */
  autoPlay: boolean
  /** After a recitation finishes naturally, auto-start voice input (listening). */
  autoListen: boolean
}

const DEFAULT_SETTINGS: TtsSettings = {
  rate: 1,
  pitch: 1,
  volume: 1,
  voiceURI: null,
  autoPlay: false,
  autoListen: false
}

/**
 * localStorage key (versioned) for persisted TTS settings. The version suffix
 * lets us cleanly invalidate stored data if the schema ever changes — stored
 * JSON is untrusted boundary input, so it is re-validated + clamped on load.
 */
const SETTINGS_KEY = 'hermes.tts.settings.v1'

/** Sample sentence spoken by the 试听 (preview) button. */
const PREVIEW_TEXT = '你好，这是当前的语音设置效果，可在此调整语速、音调与音量。'

// Client-only engine state (shared by every useTTS() caller in the session).
let voices: SpeechSynthesisVoice[] = []
let zhVoice: SpeechSynthesisVoice | null = null
let voicesBound = false

let segments: string[] = []
let cursor = 0
// The utterance currently being synthesized. MUST be retained for its
// lifetime — Chrome GCs unreferenced utterances mid-speech, silently killing
// playback (and onend never fires). Module-scoped so it survives speakNext().
let currentUtterance: SpeechSynthesisUtterance | null = null
// Whether the playback in flight should count toward `naturalEnd` (i.e. drive
// "auto-listen after recitation"). True for real recitations, false for the
// 试听 preview and reset on every speak().
let autoListenEligible = false

export function useTTS() {
  const speaking = useState<boolean>('hermes:tts:speaking', () => false)
  const activeId = useState<string | null>('hermes:tts:activeId', () => null)
  // Monotonic counter bumped ONLY when a recitation reaches its end naturally
  // (never on manual stop / preview). Watched by the composer to auto-start
  // voice input after the assistant finishes speaking.
  const naturalEnd = useState<number>('hermes:tts:naturalEnd', () => 0)
  // Adjustable, app-wide settings (persist across messages and re-renders).
  const settings = useState<TtsSettings>('hermes:tts:settings', () => ({ ...DEFAULT_SETTINGS }))
  const supported = ref(false)
  // Reactive mirror of the engine's voice list, surfaced to the settings UI.
  const voiceList = ref<SpeechSynthesisVoice[]>([])

  // Persist settings to localStorage on change. Restored in onMounted (client,
  // post-hydration) so the SSR payload can't clobber the user's saved values.
  watch(settings, (next) => persistSettings(next))

  onMounted(() => {
    if (!import.meta.client) return
    const saved = loadPersisted()
    if (saved) settings.value = saved
    supported.value = typeof window !== 'undefined' && 'speechSynthesis' in window
    if (!supported.value) return
    bindVoices()
    loadVoices()
  })

  function bindVoices(): void {
    if (voicesBound) return
    voicesBound = true
    // `voiceschanged` is the reliable signal that the voice list is ready;
    // it can fire after the first getVoices() returns empty.
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices)
  }

  function loadVoices(): void {
    if (!import.meta.client || !('speechSynthesis' in window)) return
    const list = window.speechSynthesis.getVoices()
    if (!list.length) return
    voices = list
    zhVoice = pickVoice(list, DEFAULT_LANG)
    voiceList.value = list
  }

  /** Resolve the configured voice: explicit pick by URI, else the auto zh voice. */
  function resolveVoice(): SpeechSynthesisVoice | null {
    const uri = settings.value.voiceURI
    if (uri && voices.length) {
      const found = voices.find((v) => v.voiceURI === uri)
      if (found) return found
    }
    return zhVoice
  }

  function pickVoice(list: SpeechSynthesisVoice[], lang: string): SpeechSynthesisVoice | null {
    const target = lang.toLowerCase() // zh-cn
    const primary = target.split('-')[0] // zh
    return (
      list.find((v) => v.lang.toLowerCase() === target) ??
      list.find((v) => v.lang.toLowerCase().startsWith(primary)) ??
      list.find((v) => v.default) ??
      list[0] ??
      null
    )
  }

  function speak(rawText: string, id?: string): void {
    if (!supported.value) return
    cancelInternal()
    const pieces = splitSegments(rawText)
    if (!pieces.length) return
    segments = pieces
    cursor = 0
    activeId.value = id ?? null
    // Only a genuine recitation (not the settings 试听 sample) should trigger
    // auto-listen when it ends.
    autoListenEligible = id !== '__preview__'
    speaking.value = true
    speakNext()
  }

  function speakNext(): void {
    if (!import.meta.client || !('speechSynthesis' in window)) return
    if (cursor >= segments.length) {
      // Natural completion — signal the composer so it can auto-start voice
      // input (when the user has enabled "auto-listen after recitation").
      if (autoListenEligible) naturalEnd.value++
      finish()
      return
    }
    const chunk = segments[cursor++]
    const utterance = new SpeechSynthesisUtterance(chunk)
    utterance.lang = DEFAULT_LANG
    const voice = resolveVoice()
    if (voice) utterance.voice = voice
    // Apply user-tunable settings, clamped to the engine's valid ranges.
    utterance.rate = clamp(settings.value.rate, 0.5, 2)
    utterance.pitch = clamp(settings.value.pitch, 0, 2)
    utterance.volume = clamp(settings.value.volume, 0, 1)
    // Advance on both end and error so a failed chunk never stalls the queue.
    utterance.onend = () => {
      currentUtterance = null
      speakNext()
    }
    utterance.onerror = () => {
      currentUtterance = null
      speakNext()
    }
    // Retain the reference for the utterance's full lifetime (see note above).
    currentUtterance = utterance
    window.speechSynthesis.speak(utterance)
  }

  function finish(): void {
    speaking.value = false
    activeId.value = null
    segments = []
    cursor = 0
    currentUtterance = null
  }

  function stop(): void {
    if (!supported.value) return
    cancelInternal()
    finish()
  }

  function cancelInternal(): void {
    if (!import.meta.client || !('speechSynthesis' in window)) return
    currentUtterance = null
    try {
      window.speechSynthesis.cancel()
    } catch {
      // engine unavailable — nothing to cancel
    }
  }

  function pause(): void {
    if (supported.value && import.meta.client) window.speechSynthesis.pause()
  }

  function resume(): void {
    if (supported.value && import.meta.client) window.speechSynthesis.resume()
  }

  /** Toggle: if this message is currently speaking, stop; otherwise speak it. */
  function toggle(text: string, id?: string): void {
    if (speaking.value && (id == null || activeId.value === id)) {
      stop()
    } else {
      speak(text, id)
    }
  }

  /** Speak a short sample with the current settings (for the 试听 button). */
  function preview(): void {
    speak(PREVIEW_TEXT, '__preview__')
  }

  function resetSettings(): void {
    settings.value = { ...DEFAULT_SETTINGS }
  }

  return {
    supported: readonly(supported),
    speaking,
    activeId,
    naturalEnd,
    settings,
    voiceList,
    speak,
    stop,
    pause,
    resume,
    toggle,
    preview,
    resetSettings
  }
}

/** Clamp a number into [min, max]. */
function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min
  return Math.min(max, Math.max(min, n))
}

/** Type guard rejecting NaN (NaN is typeof 'number'). */
function isNumber(v: unknown): v is number {
  return typeof v === 'number' && !Number.isNaN(v)
}

/**
 * Read and validate persisted TTS settings from localStorage. Stored data is
 * untrusted, so each field is type-checked and clamped back into range; any
 * structural damage (missing key, bad JSON) returns null → fall back to
 * defaults. Client-only.
 */
function loadPersisted(): TtsSettings | null {
  if (!import.meta.client) return null
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<TtsSettings>
    return {
      rate: clamp(isNumber(parsed.rate) ? parsed.rate : DEFAULT_SETTINGS.rate, 0.5, 2),
      pitch: clamp(isNumber(parsed.pitch) ? parsed.pitch : DEFAULT_SETTINGS.pitch, 0, 2),
      volume: clamp(isNumber(parsed.volume) ? parsed.volume : DEFAULT_SETTINGS.volume, 0, 1),
      voiceURI: typeof parsed.voiceURI === 'string' ? parsed.voiceURI : null,
      autoPlay: typeof parsed.autoPlay === 'boolean' ? parsed.autoPlay : DEFAULT_SETTINGS.autoPlay,
      autoListen:
        typeof parsed.autoListen === 'boolean' ? parsed.autoListen : DEFAULT_SETTINGS.autoListen
    }
  } catch {
    return null
  }
}

/**
 * Write the current settings to localStorage. Failures (private mode, quota
 * exceeded, disabled storage) are swallowed — settings simply stay in-session
 * for the rest of the visit. Client-only.
 */
function persistSettings(settings: TtsSettings): void {
  if (!import.meta.client) return
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // storage unavailable / full — non-fatal, in-session only
  }
}

/**
 * Reduce an assistant message (string or multimodal parts) to clean plain text
 * for speech synthesis: flatten parts, drop fenced/inline code, images, link
 * URLs (keep the label), and strip emphasis / list / heading / blockquote
 * sigils so only spoken words remain. Shared by manual speak and auto-play so
 * both read identical text.
 */
export function prepareSpeechText(content: unknown): string {
  const raw =
    typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content
            .map((part) =>
              typeof part === 'string' ? part : (part as { text?: string })?.text ?? ''
            )
            .join('')
        : ''

  return raw
    .replace(/```[\w-]*\n?[\s\S]*?```/g, ' ') // fenced code blocks
    .replace(/`([^`]*)`/g, '$1') // inline code → text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links → label
    .replace(/^\s{0,3}>\s?/gm, '') // blockquote markers
    .replace(/^\s{0,3}[-*+]\s+/gm, '') // bullet markers
    .replace(/^\s{0,3}\d+[.)]\s+/gm, '') // ordered list markers
    .replace(/^\s{0,3}#{1,6}\s+/gm, '') // heading hashes
    .replace(/[*_~]/g, '') // emphasis marks
    .replace(/\|/g, ' ') // table pipes
    .replace(/<[^>]+>/g, ' ') // stray HTML tags
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

/**
 * Split text into sentence-sized segments. Splits on Chinese + Latin sentence
 * enders and newlines (keeping the punctuation), then hard-chunks any segment
 * still over the cap so a single run-on sentence can't stall synthesis.
 */
function splitSegments(text: string): string[] {
  const cleaned = text.replace(/\r/g, '').trim()
  if (!cleaned) return []

  const matched =
    cleaned.match(/[^。！？!?\n；;…]+[。！？!?\n；;…]*|[^。！？!?\n；;…]+$/g) ?? [cleaned]

  const out: string[] = []
  for (const part of matched) {
    const piece = part.trim()
    if (!piece) continue
    if (piece.length <= MAX_SEGMENT_CHARS) {
      out.push(piece)
    } else {
      for (let i = 0; i < piece.length; i += MAX_SEGMENT_CHARS) {
        out.push(piece.slice(i, i + MAX_SEGMENT_CHARS))
      }
    }
  }
  return out
}
