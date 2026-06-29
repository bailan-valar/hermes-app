<script setup lang="ts">
const props = withDefaults(defineProps<{
  pending?: boolean
  placeholder?: string
  disabled?: boolean
}>(), {
  pending: false,
  placeholder: '输入消息，与 Hermes 对话…',
  disabled: false
})

const emit = defineEmits<{ send: [text: string]; stop: [] }>()

const text = ref('')
const el = ref<HTMLTextAreaElement | null>(null)
const toast = useToast()

function autoGrow() {
  const node = el.value
  if (!node) return
  node.style.height = 'auto'
  node.style.height = `${Math.min(node.scrollHeight, 200)}px`
}

watch(text, () => nextTick(autoGrow))

/** Append a finalized speech segment to the input. A separating space is only
 *  inserted between two Latin/digit runs, so CJK text stays glueless. */
function appendSpeech(segment: string): void {
  const s = segment.trim()
  if (!s) return
  const prev = text.value
  const joinLatin =
    prev.length > 0 &&
    /[A-Za-z0-9]/.test(prev.slice(-1)) &&
    /[A-Za-z0-9]/.test(s[0])
  text.value = prev + (joinLatin ? ' ' : '') + s
}

const {
  supported: speechSupported,
  listening: isListening,
  interim: speechInterim,
  error: speechError,
  toggle: toggleSpeech,
  stop: stopSpeech,
  start: startSpeech
} = useSpeech({ onFinal: appendSpeech })

// Shared TTS state — used to auto-start voice input after a recitation ends.
const { settings: ttsSettings, naturalEnd: ttsNaturalEnd } = useTTS()

// Surface speech errors (e.g. denied mic permission) as a user-facing toast.
watch(speechError, (msg) => {
  if (msg) toast.error(msg)
})

/**
 * Auto-listen: when a recitation finishes naturally and the user has enabled
 * "朗诵完毕自动聆听", start voice input hands-free. Triggered by the shared
 * monotonic counter so only genuine completions (never manual stop / preview)
 * kick this off.
 */
watch(ttsNaturalEnd, (n, prev) => {
  if (!n || n === prev) return
  if (!ttsSettings.value.autoListen) return
  if (!speechSupported.value || isListening.value || props.disabled || props.pending) return
  startSpeech()
})

/** Has any finalized text accumulated from dictation (drives the 发送 enabled state). */
const hasText = computed(() => text.value.trim().length > 0)

/** Cancel voice input: stop listening and keep whatever was dictated so it can
 *  still be edited or sent manually. */
function cancelSpeech(): void {
  stopSpeech()
}

/** Redo: discard the dictated text and start a fresh recognition session. */
function retrySpeech(): void {
  stopSpeech()
  text.value = ''
  nextTick(autoGrow)
  // Defer start one tick so the previous engine session can wind down; useSpeech
  // auto-restarts from onend while shouldListen is true.
  nextTick(() => startSpeech())
}

function submit() {
  const value = text.value.trim()
  if (!value || props.pending || props.disabled) return
  stopSpeech()
  emit('send', value)
  text.value = ''
  nextTick(autoGrow)
}

function onKeydown(e: KeyboardEvent) {
  // Enter to send, Shift+Enter for newline.
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    submit()
  }
}

onMounted(() => autoGrow())
</script>

<template>
  <div class="compose">
    <!-- Live voice caption — only while dictating -->
    <Transition name="fade">
      <div
        v-if="isListening"
        class="compose__voice glass glass--subtle"
        role="status"
        aria-live="polite"
      >
        <span class="compose__voice-dot" />
        <span class="compose__voice-label">正在聆听</span>
        <span class="compose__voice-interim" :class="{ 'is-empty': !speechInterim }">
          {{ speechInterim || '请说话…' }}
        </span>
      </div>
    </Transition>

    <div class="compose__bar glass glass--strong">
      <textarea
        ref="el"
        v-model="text"
        class="compose__input"
        rows="1"
        :placeholder="placeholder"
        :disabled="disabled"
        @keydown="onKeydown"
      />

      <!-- Voice dictation toggle — only where the Web Speech API is available.
           Hidden while listening; the dedicated action bar below takes over. -->
      <button
        v-if="speechSupported && !isListening"
        class="glass-btn glass-btn--icon compose__mic"
        aria-pressed="false"
        aria-label="语音输入"
        title="语音输入"
        :disabled="disabled"
        @click="toggleSpeech"
      >
        <GlassIcon name="mic" :size="19" :stroke="2.2" />
      </button>

      <button
        v-if="pending"
        class="glass-btn glass-btn--danger compose__send"
        aria-label="停止生成"
        title="停止生成"
        @click="emit('stop')"
      >
        <GlassIcon name="stop" :size="18" />
      </button>
      <button
        v-else-if="!isListening"
        class="glass-btn glass-btn--primary compose__send"
        :disabled="!text.trim() || disabled"
        aria-label="发送"
        title="发送 (Enter)"
        @click="submit"
      >
        <GlassIcon name="send" :size="18" :stroke="2.2" />
      </button>
    </div>

    <!-- Large voice-input actions — shown only while dictating. Big touch
         targets for thumb reach on mobile; replaces the compact mic/send row. -->
    <Transition name="fade">
      <div
        v-if="isListening"
        class="compose__voice-actions"
        role="group"
        aria-label="语音输入控制"
      >
        <button
          type="button"
          class="glass-btn compose__vbtn compose__vbtn--cancel"
          aria-label="取消语音输入"
          @click="cancelSpeech"
        >
          <GlassIcon name="x" :size="20" :stroke="2.2" />
          <span>取消</span>
        </button>
        <button
          type="button"
          class="glass-btn compose__vbtn compose__vbtn--retry"
          aria-label="重新录音"
          @click="retrySpeech"
        >
          <GlassIcon name="refresh" :size="20" :stroke="2.2" />
          <span>重来</span>
        </button>
        <button
          type="button"
          class="glass-btn glass-btn--primary compose__vbtn compose__vbtn--send"
          :disabled="!hasText"
          aria-label="发送"
          @click="submit"
        >
          <GlassIcon name="send" :size="20" :stroke="2.2" />
          <span>发送</span>
        </button>
      </div>
    </Transition>

    <p v-if="!isListening" class="compose__hint">
      <GlassIcon name="sparkles" :size="12" :stroke="2.2" />
      Hermes 可调用终端、文件、网页搜索等工具 · <kbd>Enter</kbd> 发送 · <kbd>Shift</kbd>+<kbd>Enter</kbd> 换行<template v-if="speechSupported"> · <GlassIcon name="mic" :size="12" :stroke="2.2" /> 语音输入</template>
    </p>
  </div>
</template>

<style scoped>
.compose {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.compose__bar {
  display: flex;
  align-items: flex-end;
  gap: var(--space-2);
  padding: var(--space-2);
  border-radius: var(--radius-xl);
}
.compose__input {
  flex: 1;
  resize: none;
  border: none;
  outline: none;
  background: none;
  color: var(--text-primary);
  font-size: var(--text-base);
  line-height: 1.5;
  padding: var(--space-3) var(--space-3);
  max-height: 200px;
  min-height: 24px;
}
.compose__input::placeholder { color: var(--text-tertiary); }
.compose__send {
  flex: none;
  width: 46px;
  height: 46px;
  border-radius: var(--radius-full);
  padding: 0;
}
.compose__mic {
  flex: none;
  width: 46px;
  height: 46px;
  border-radius: var(--radius-full);
  padding: 0;
  color: var(--text-secondary);
}
.compose__mic:hover { color: var(--text-primary); }

/* Live dictation caption */
.compose__voice {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  color: var(--text-secondary);
}
.compose__voice-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: oklch(60% 0.22 25);
  flex: none;
  animation: blink 1.2s infinite both;
}
.compose__voice-label {
  font-weight: 600;
  color: oklch(58% 0.22 25);
  flex: none;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .compose__voice-label { color: oklch(74% 0.2 25); }
}
.compose__voice-interim {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.compose__voice-interim.is-empty { color: var(--text-tertiary); }

.compose__hint {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-tertiary);
  font-size: var(--text-xs);
  padding: 0 var(--space-2);
}
.compose__hint kbd {
  font-family: var(--font-mono);
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 5px;
  background: var(--glass-fill-subtle);
  border: 1px solid var(--glass-border-dim);
}

/* Large voice-input action bar — oversized touch targets for dictation mode */
.compose__voice-actions {
  display: flex;
  gap: var(--space-2);
  width: 100%;
}
.compose__vbtn {
  flex: 1;
  min-height: 56px;
  padding: var(--space-3) var(--space-2);
  font-size: var(--text-base);
  border-radius: var(--radius-md);
}
.compose__vbtn span { font-weight: 600; }
.compose__vbtn--retry { color: var(--text-secondary); }
.compose__vbtn--cancel { color: var(--text-secondary); }

.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--dur-normal) var(--ease-out-expo);
}
.fade-enter-from,
.fade-leave-to { opacity: 0; }

@media (prefers-reduced-motion: reduce) {
  .compose__voice-dot { animation: none; }
}

/* ── Mobile / landscape adaptation ───────────────────────────────── */
/* No hardware keyboard hint on phones; the voice-action bar is the primary input surface. */
@media (max-width: 640px) {
  .compose__hint { display: none; }
}
/* In landscape the vertical budget is tight — slim the composer chrome. */
@media (orientation: landscape) and (max-height: 480px) {
  .compose__bar { padding: var(--space-1); }
  .compose__vbtn { min-height: 48px; }
  .compose__voice {
    padding: var(--space-1) var(--space-3);
  }
}
</style>
