/**
 * useSpeech — a thin reactive wrapper around the browser Web Speech API
 * (`SpeechRecognition`) for in-place voice dictation into a text field.
 *
 * Design notes:
 * - SSR-safe: every `window` / `SpeechRecognition` access is guarded behind
 *   `import.meta.client`. `supported` is resolved in `onMounted` so server and
 *   client hydration render identically (no mic button mismatch).
 * - Local state uses plain `ref` (not `useState`): recognition is tied to one
 *   input instance and never shared across the app.
 * - Types are declared locally rather than relying on `lib.dom`'s
 *   `SpeechRecognition` (which varies by TS version) and without `any`. The
 *   constructor is obtained through a typed window accessor.
 * - Continuous dictation: Chrome ends recognition on silence / ~60s; while the
 *   user still intends to listen (`shouldListen`) we transparently restart —
 *   unless a fatal error (permission / hardware / language) makes restarting
 *   pointless, which would otherwise loop.
 */
type SpeechRecognitionCtor = new () => SpeechRecognitionLike

interface SpeechRecognitionAlternative {
  transcript: string
  confidence: number
}

interface SpeechRecognitionResult {
  readonly length: number
  readonly isFinal: boolean
  item(index: number): SpeechRecognitionAlternative
  readonly [index: number]: SpeechRecognitionAlternative
}

interface SpeechRecognitionResultList {
  readonly length: number
  item(index: number): SpeechRecognitionResult
  readonly [index: number]: SpeechRecognitionResult
}

interface SpeechRecognitionEventLike extends Event {
  readonly resultIndex: number
  readonly results: SpeechRecognitionResultList
}

interface SpeechRecognitionErrorEventLike extends Event {
  readonly error: string
  readonly message: string
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onstart: (() => void) | null
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
}

export interface UseSpeechOptions {
  /** BCP-47 language tag for recognition. Defaults to Simplified Chinese. */
  lang?: string
  /** Invoked with each finalized transcript segment. */
  onFinal?: (text: string) => void
}

/** Errors that make auto-restarting pointless (and would loop). */
const FATAL_ERRORS = new Set([
  'not-allowed',
  'service-not-allowed',
  'audio-capture',
  'language-not-supported'
])

export function useSpeech(options: UseSpeechOptions = {}) {
  const lang = options.lang ?? 'zh-CN'

  const supported = ref(false)
  const listening = ref(false)
  const interim = ref('')
  const error = ref<string | null>(null)

  // Recognition is created lazily on first start and reused thereafter.
  let recognition: SpeechRecognitionLike | null = null
  // `true` while the user wants to keep dictating — drives auto-restart.
  let shouldListen = false
  // Tracks whether the underlying engine is currently running.
  let running = false
  // A fatal error disables auto-restart.
  let fatal = false
  // Index of the next result we have not yet committed as final. Reset on each
  // start() because a new recognition session renumbers results from 0.
  let readIndex = 0
  // Latest non-final (interim) transcript — flushed on stop so no words drop.
  let pendingInterim = ''

  function getCtor(): SpeechRecognitionCtor | null {
    if (!import.meta.client) return null
    const w = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor
      webkitSpeechRecognition?: SpeechRecognitionCtor
    }
    return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
  }

  /** Resolve availability after mount so SSR and client render match. */
  onMounted(() => {
    supported.value = !!getCtor()
  })

  function setError(message: string | null): void {
    // Guard against repeating the identical message (e.g. sustained network
    // errors during auto-restart) to avoid toast spam.
    if (error.value !== message) error.value = message
  }

  function ensureRecognition(): SpeechRecognitionLike | null {
    if (!import.meta.client) return null
    if (recognition) return recognition
    const Ctor = getCtor()
    if (!Ctor) return null

    const rec = new Ctor()
    rec.lang = lang
    rec.continuous = true
    rec.interimResults = true
    rec.maxAlternatives = 1

    rec.onstart = () => {
      running = true
      readIndex = 0
    }

    rec.onresult = (event: SpeechRecognitionEventLike) => {
      const results = event.results
      let newFinal = ''
      let interimText = ''
      for (let i = 0; i < results.length; i++) {
        const result = results[i]
        if (result.isFinal) {
          if (i >= readIndex) {
            newFinal += result[0].transcript
            readIndex = i + 1
          }
        } else if (i >= readIndex) {
          interimText += result[0].transcript
        }
      }
      pendingInterim = interimText
      interim.value = interimText
      if (newFinal) options.onFinal?.(newFinal)
    }

    rec.onerror = (event: SpeechRecognitionErrorEventLike) => {
      const code = event.error || 'unknown'
      if (FATAL_ERRORS.has(code)) {
        fatal = true
        shouldListen = false
        setError(humanizeError(code))
      } else if (code !== 'no-speech' && code !== 'aborted') {
        setError(humanizeError(code))
      }
    }

    rec.onend = () => {
      running = false
      // Auto-restart while the user still intends to listen (Chrome ends on
      // silence / timeout). Skip on fatal errors to avoid a restart loop.
      if (shouldListen && !fatal) {
        tryStart()
      } else {
        listening.value = false
      }
    }

    recognition = rec
    return rec
  }

  function tryStart(): void {
    const rec = ensureRecognition()
    if (!rec || running) return
    try {
      rec.start()
    } catch {
      // InvalidStateError if start() races a still-stopping instance — ignore.
    }
  }

  function start(): void {
    if (!import.meta.client) return
    if (!getCtor()) {
      setError('当前浏览器不支持语音输入')
      return
    }
    error.value = null
    fatal = false
    readIndex = 0
    pendingInterim = ''
    interim.value = ''
    shouldListen = true
    tryStart()
    listening.value = true
  }

  function stop(): void {
    shouldListen = false
    // Commit any interim the engine never finalized so nothing is lost.
    const leftover = pendingInterim.trim()
    if (leftover) {
      options.onFinal?.(leftover)
      pendingInterim = ''
      interim.value = ''
    }
    if (recognition && running) {
      try {
        recognition.stop()
      } catch {
        // ignore — engine already stopped
      }
    }
    listening.value = false
  }

  function toggle(): void {
    if (listening.value || shouldListen) stop()
    else start()
  }

  onBeforeUnmount(() => {
    shouldListen = false
    if (recognition) {
      try {
        recognition.abort()
      } catch {
        // ignore
      }
      recognition = null
    }
  })

  return {
    supported: readonly(supported),
    listening: readonly(listening),
    interim: readonly(interim),
    error: readonly(error),
    start,
    stop,
    toggle
  }
}

function humanizeError(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return '麦克风权限被拒绝，请在浏览器设置中允许'
    case 'audio-capture':
      return '未检测到麦克风设备'
    case 'network':
      return '语音服务网络错误'
    case 'language-not-supported':
      return '当前语言暂不支持语音识别'
    default:
      return '语音识别出错'
  }
}
