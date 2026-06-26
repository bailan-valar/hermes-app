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
  stop: stopSpeech
} = useSpeech({ onFinal: appendSpeech })

// Surface speech errors (e.g. denied mic permission) as a user-facing toast.
watch(speechError, (msg) => {
  if (msg) toast.error(msg)
})

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

      <!-- Voice dictation toggle — only where the Web Speech API is available -->
      <button
        v-if="speechSupported"
        class="glass-btn glass-btn--icon compose__mic"
        :class="{ 'is-recording': isListening }"
        :aria-pressed="isListening"
        :aria-label="isListening ? '停止语音输入' : '语音输入'"
        :title="isListening ? '停止语音输入' : '语音输入'"
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
        v-else
        class="glass-btn glass-btn--primary compose__send"
        :disabled="!text.trim() || disabled"
        aria-label="发送"
        title="发送 (Enter)"
        @click="submit"
      >
        <GlassIcon name="send" :size="18" :stroke="2.2" />
      </button>
    </div>
    <p class="compose__hint">
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
.compose__mic.is-recording {
  color: oklch(58% 0.22 25);
  background: oklch(72% 0.2 25 / 0.3);
  animation: mic-pulse 1.6s var(--ease-out-expo) infinite;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .compose__mic.is-recording { color: oklch(74% 0.2 25); }
}
@keyframes mic-pulse {
  0% { box-shadow: 0 0 0 0 oklch(60% 0.22 25 / 0.5); }
  70% { box-shadow: 0 0 0 12px oklch(60% 0.22 25 / 0); }
  100% { box-shadow: 0 0 0 0 oklch(60% 0.22 25 / 0); }
}

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

.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--dur-normal) var(--ease-out-expo);
}
.fade-enter-from,
.fade-leave-to { opacity: 0; }

@media (prefers-reduced-motion: reduce) {
  .compose__mic.is-recording { animation: none; }
  .compose__voice-dot { animation: none; }
}
</style>
