<script setup lang="ts">
import type { HermesMessage } from '~/types/hermes'

const props = withDefaults(defineProps<{
  message: HermesMessage
  streaming?: boolean
}>(), {
  streaming: false
})

const { render } = useMarkdown()
const { absoluteTime } = useTime()
const tts = useTTS()
const { supported: ttsSupported, speaking: ttsSpeaking, activeId: ttsActiveId } = tts

const isUser = computed(() => props.message.role === 'user')
const isAssistant = computed(() => props.message.role === 'assistant')

/**
 * Stable id used to track which message is currently being spoken. Historical
 * messages from Hermes frequently lack `id`, so fall back to a per-instance
 * Vue useId() — without this the speak toggle no-ops on id-less messages.
 */
const fallbackId = useId()
const ttsId = computed(() => {
  const raw = props.message.id
  return (typeof raw === 'string' || typeof raw === 'number') && String(raw) !== ''
    ? String(raw)
    : fallbackId
})
/** This bubble is the one currently being read aloud. */
const ttsActive = computed(() => ttsSpeaking.value && ttsActiveId.value === ttsId.value)

/** Plain-text view of the message for speech synthesis (shared normalizer). */
function speakableText(): string {
  return prepareSpeechText(text.value) || text.value
}

function toggleSpeak() {
  if (!ttsId.value) return
  tts.toggle(speakableText(), ttsId.value)
}

/** Flatten string or multimodal-parts content into plain text. */
const text = computed(() => {
  const c = props.message.content
  if (typeof c === 'string') return c
  if (Array.isArray(c)) {
    return c
      .map((part) => {
        if (typeof part === 'string') return part
        if (part?.text) return String(part.text)
        return ''
      })
      .join('')
  }
  return ''
})

const html = computed(() => {
  // Assistant output is markdown; user/tool text is shown verbatim (whitespace kept).
  return isAssistant.value ? render(text.value) : escapeForUser(text.value)
})

const toolNames = computed(() => {
  const calls = props.message.tool_calls
  if (!Array.isArray(calls) || !calls.length) return []
  return calls.map((c) => String(c?.name || c?.function?.name || c?.call_id || 'tool'))
})

const copied = ref(false)
async function copyText() {
  try {
    await navigator.clipboard.writeText(text.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    /* clipboard unavailable */
  }
}

const time = computed(() => {
  if (typeof props.message.timestamp === 'number') return absoluteTime(props.message.timestamp)
  if (props.message.created_at) return absoluteTime(props.message.created_at)
  return ''
})

function escapeForUser(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
}
</script>

<template>
  <div class="msg" :class="{ 'msg--user': isUser, 'msg--assistant': isAssistant }">
    <span v-if="isAssistant" class="msg__avatar msg__avatar--ai">
      <GlassIcon name="sparkles" :size="18" />
    </span>

    <div class="msg__col">
      <div class="msg__bubble glass" :class="isUser ? 'msg__bubble--user' : 'msg__bubble--ai'">
        <div
          class="msg__content"
          :class="{ 'md': isAssistant }"
          v-html="html"
        />
        <span v-if="streaming" class="stream-caret" />

        <!-- Inline tool badges for historical assistant turns -->
        <div v-if="toolNames.length" class="msg__tools">
          <span v-for="t in toolNames" :key="t" class="msg__tool chip">
            <GlassIcon name="wrench" :size="12" :stroke="2.2" /> {{ t }}
          </span>
        </div>
      </div>

      <div class="msg__foot">
        <button
          v-if="!streaming && text"
          class="msg__copy"
          :aria-label="copied ? '已复制' : '复制'"
          @click="copyText"
        >
          <GlassIcon :name="copied ? 'check' : 'copy'" :size="13" :stroke="2.2" />
          <span>{{ copied ? '已复制' : '复制' }}</span>
        </button>
        <button
          v-if="ttsSupported && isAssistant && !streaming && text"
          class="msg__copy msg__tts"
          :class="{ 'msg__tts--active': ttsActive }"
          :aria-pressed="ttsActive"
          :aria-label="ttsActive ? '停止朗读' : '朗读'"
          :title="ttsActive ? '停止朗读' : '朗读'"
          @click="toggleSpeak"
        >
          <GlassIcon :name="ttsActive ? 'volume-off' : 'volume'" :size="13" :stroke="2.2" />
          <span>{{ ttsActive ? '停止' : '朗读' }}</span>
        </button>
        <span v-if="time" class="msg__time">{{ time }}</span>
      </div>
    </div>

    <span v-if="isUser" class="msg__avatar msg__avatar--user">
      <GlassIcon name="user" :size="18" />
    </span>
  </div>
</template>

<style scoped>
.msg {
  display: flex;
  gap: var(--space-3);
  align-items: flex-start;
  animation: fade-in-up var(--dur-normal) var(--ease-spring) both;
}
.msg--user {
  flex-direction: row-reverse;
}
.msg__col {
  display: flex;
  flex-direction: column;
  gap: 5px;
  max-width: min(78%, 640px);
}
.msg--user .msg__col { align-items: flex-end; }

.msg__avatar {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  flex: none;
  border-radius: var(--radius-full);
  margin-top: 2px;
  box-shadow: var(--shadow-sm), var(--inner-edge);
}
.msg__avatar--ai {
  background: var(--accent-gradient);
  color: #fff;
}
.msg__avatar--user {
  background: var(--glass-fill-strong);
  color: var(--text-secondary);
}

.msg__bubble {
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-lg);
  line-height: 1.6;
  word-break: break-word;
}
.msg__bubble--user {
  background: var(--glass-tint-user);
  border-bottom-right-radius: var(--radius-sm);
}
.msg__bubble--ai {
  background: var(--glass-tint-assistant);
  border-bottom-left-radius: var(--radius-sm);
}
.msg__content {
  font-size: var(--text-base);
  color: var(--text-primary);
}

.msg__tools {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: var(--space-2);
  padding-top: var(--space-2);
  border-top: 1px solid var(--glass-border-dim);
}
.msg__tool {
  color: var(--accent-2);
}

.msg__foot {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 0 var(--space-1);
}
.msg__copy {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  padding: 3px 7px;
  border-radius: var(--radius-full);
  transition: color var(--dur-fast) var(--ease-standard), background var(--dur-fast) var(--ease-standard);
}
.msg__copy:hover {
  color: var(--text-secondary);
  background: var(--glass-fill-subtle);
}
/* The message currently being read aloud. */
.msg__tts--active {
  color: var(--accent-2);
}
.msg__tts--active:hover {
  color: var(--accent-2);
  background: var(--glass-fill-subtle);
}
.msg__time {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

@media (max-width: 640px) {
  .msg__col { max-width: 86%; }
}
</style>

<style>
/* Markdown content styles — global so v-html children are styled. */
.msg__content.md > *:first-child { margin-top: 0; }
.msg__content.md > *:last-child { margin-bottom: 0; }
.msg__content.md p { margin: 0 0 var(--space-2); }
.msg__content.md h1, .msg__content.md h2, .msg__content.md h3 {
  margin: var(--space-4) 0 var(--space-2);
  font-weight: 700;
  line-height: 1.3;
}
.msg__content.md .md-h1 { font-size: var(--text-xl); }
.msg__content.md .md-h2 { font-size: var(--text-lg); }
.msg__content.md .md-h3 { font-size: var(--text-base); }
.msg__content.md ul, .msg__content.md ol {
  margin: 0 0 var(--space-2);
  padding-left: var(--space-5);
}
.msg__content.md li { margin: 3px 0; }
.msg__content.md .md-code {
  font-family: var(--font-mono);
  font-size: 0.88em;
  padding: 1px 6px;
  border-radius: 6px;
  background: var(--glass-fill-subtle);
  border: 1px solid var(--glass-border-dim);
}
.msg__content.md .md-pre {
  margin: 0 0 var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  background: oklch(20% 0.02 var(--hue-violet) / 0.55);
  border: 1px solid var(--glass-border-dim);
  overflow-x: auto;
}
.msg__content.md .md-pre code {
  font-family: var(--font-mono);
  font-size: 0.85em;
  color: oklch(92% 0.01 var(--hue-sky));
  background: none;
  border: none;
  padding: 0;
  line-height: 1.55;
}
.msg__content.md a {
  color: var(--accent-1);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.msg__content.md blockquote {
  margin: 0 0 var(--space-2);
  padding: var(--space-1) var(--space-3);
  border-left: 3px solid var(--accent-2);
  color: var(--text-secondary);
}
.msg__content.md .md-hr {
  border: none;
  height: 1px;
  background: var(--glass-border-dim);
  margin: var(--space-3) 0;
}
.msg__content.md strong { font-weight: 700; }
</style>
