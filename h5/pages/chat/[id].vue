<script setup lang="ts">
import type { HermesSession } from '~/types/hermes'

const route = useRoute()
const id = computed(() => String(route.params.id))

const chat = useChat()
const { findById, rename, remove, refresh } = useSessions()

const session = ref<HermesSession | null>(null)
const title = computed(() => {
  const t = session.value?.title
  return t && String(t).trim() ? String(t) : '新会话'
})

const scrollEl = ref<HTMLElement | null>(null)
const stick = ref(true)
const toast = useToast()

// Rename / delete dialog state
const renameOpen = ref(false)
const renameInitial = ref('')
const deleteOpen = ref(false)
const deleting = ref(false)

// Voice (TTS) settings dialog
const { supported: ttsSupported, settings: ttsSettings, speak: ttsSpeak } = useTTS()
const voiceSettingsOpen = ref(false)

/** When auto-play is on, read each assistant reply aloud as it finishes. */
watch(
  () => chat.pending.value,
  (pending, prev) => {
    if (!prev || pending) return // only fire on the true→false edge
    if (!ttsSettings.value.autoPlay) return
    const msgs = chat.messages.value
    const last = msgs[msgs.length - 1]
    if (!last || last.role !== 'assistant') return
    const speech = prepareSpeechText(last.content)
    if (speech) ttsSpeak(speech, String(last.id ?? ''))
  }
)

/** Has the assistant started producing actual text for this turn? */
const hasDraft = computed(() => chat.draftContent.value.trim().length > 0)

/** Keep the view pinned to the latest message while streaming — unless the
 *  user has scrolled up to read history. */
function maybeScroll() {
  if (!stick.value) return
  const el = scrollEl.value
  if (el) el.scrollTop = el.scrollHeight
}

function onScroll() {
  const el = scrollEl.value
  if (!el) return
  stick.value = el.scrollHeight - el.scrollTop - el.clientHeight < 120
}

function jumpToBottom() {
  stick.value = true
  nextTick(() => {
    const el = scrollEl.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

watch(() => chat.messages.value.length, () => nextTick(maybeScroll))
watch(() => chat.draftContent.value, () => nextTick(maybeScroll))
watch(() => chat.tools.value.length, () => nextTick(maybeScroll))

async function loadAll() {
  // Resolve the session meta (cache first, then fetch).
  const cached = findById(id.value)
  if (cached) {
    session.value = cached
  } else {
    try {
      const hermes = useHermes()
      session.value = await hermes.getSession(id.value)
      refresh(true)
    } catch {
      session.value = null
    }
  }
  await chat.load(id.value)
  stick.value = true
  await nextTick(maybeScroll)
}

onMounted(loadAll)
onBeforeUnmount(() => {
  chat.reset()
  // Stop any in-flight text-to-speech so it doesn't keep playing after leaving.
  useTTS().stop()
})
watch(id, loadAll)

function handleSend(text: string) {
  stick.value = true
  chat.send(id.value, text)
}
function handleStop() {
  chat.stop()
}

function openRename() {
  renameInitial.value = String(session.value?.title ?? '')
  renameOpen.value = true
}
async function handleRename(t: string) {
  try {
    await rename(id.value, t)
    session.value = session.value ? { ...session.value, title: t } : session.value
    toast.success('已重命名')
  } catch (e) {
    toast.error('重命名失败：' + errText(e))
  }
}

function openDelete() {
  deleteOpen.value = true
}
async function handleDelete() {
  deleting.value = true
  try {
    await remove(id.value)
    await navigateTo('/')
  } catch (e) {
    toast.error('删除失败：' + errText(e))
  } finally {
    deleting.value = false
  }
}

function errText(e: unknown): string {
  if (e && typeof e === 'object' && 'data' in e) {
    const data = (e as Record<string, unknown>).data
    if (data && typeof data === 'object' && 'message' in data) {
      return String((data as Record<string, unknown>).message)
    }
    if (typeof data === 'string') return data
  }
  if (e instanceof Error) return e.message
  return '未知错误'
}

useHead({ title: () => `${title.value} · Hermes` })
</script>

<template>
  <div class="chat">
    <AppHeader show-back :title="title" @back="navigateTo('/')">
      <template #actions>
        <button
          v-if="ttsSupported"
          class="glass-btn glass-btn--icon"
          :class="{ 'glass-btn--primary': ttsSettings.autoPlay }"
          :aria-label="ttsSettings.autoPlay ? '自动朗读已开启，打开语音设置' : '语音朗读设置'"
          :title="ttsSettings.autoPlay ? '自动朗读已开启 · 点击调整' : '语音朗读设置'"
          @click="voiceSettingsOpen = true"
        >
          <GlassIcon :name="ttsSettings.autoPlay ? 'volume-auto' : 'volume'" :size="17" />
        </button>
        <button class="glass-btn glass-btn--icon" aria-label="重命名" title="重命名" @click="openRename">
          <GlassIcon name="pencil" :size="17" />
        </button>
        <button
          class="glass-btn glass-btn--icon glass-btn--danger"
          aria-label="删除会话"
          title="删除会话"
          @click="openDelete"
        >
          <GlassIcon name="trash" :size="17" />
        </button>
      </template>
    </AppHeader>

    <section class="chat__body glass glass--strong">
      <div ref="scrollEl" class="chat__scroll" @scroll.passive="onScroll">
        <div class="chat__inner">
          <!-- Loading history -->
          <div v-if="chat.loading.value && !chat.messages.value.length" class="chat__loading">
            <span class="spinner" /> <span class="text-tertiary">加载消息历史…</span>
          </div>

          <template v-else-if="chat.messages.value.length">
            <MessageBubble
              v-for="m in chat.messages.value"
              :key="(m.id as string) || JSON.stringify(m).slice(0, 40)"
              :message="m"
            />
          </template>

          <!-- Empty conversation -->
          <EmptyState
            v-else-if="!chat.pending.value"
            icon="sparkles"
            title="开始对话"
            hint="向 Hermes agent 提问，它会自动调用终端、文件、网页搜索等工具完成任务。"
          />

          <!-- In-flight turn -->
          <template v-if="chat.pending.value">
            <div v-if="chat.tools.value.length" class="chat__tools">
              <ToolIndicator v-for="t in chat.tools.value" :key="t.id" :tool="t" />
            </div>
            <MessageBubble
              v-if="hasDraft"
              :message="{ role: 'assistant', content: chat.draftContent.value }"
              :streaming="true"
            />
            <div v-else class="chat__typing glass glass--subtle">
              <span class="typing-dots"><span /><span /><span /></span>
              <span class="text-tertiary">Hermes 思考中…</span>
            </div>
          </template>
        </div>
      </div>

      <!-- Error banner -->
      <Transition name="fade">
        <div v-if="chat.error.value" class="chat__error">
          <GlassIcon name="alert-triangle" :size="16" />
          <span>{{ chat.error.value }}</span>
        </div>
      </Transition>

      <!-- Jump-to-latest pill -->
      <Transition name="fade">
        <button v-if="!stick" class="chat__jump glass-btn glass-btn--icon" aria-label="滚动到最新" @click="jumpToBottom">
          <GlassIcon name="chevron-left" :size="18" style="transform: rotate(-90deg)" />
        </button>
      </Transition>

      <!-- Composer -->
      <div class="chat__compose">
        <ComposeBar
          :pending="chat.pending.value"
          :disabled="chat.loading.value"
          @send="handleSend"
          @stop="handleStop"
        />
      </div>
    </section>

    <PromptDialog
      v-model="renameOpen"
      title="重命名会话"
      label="会话标题"
      :initial-value="renameInitial"
      placeholder="输入新的会话标题"
      confirm-text="保存"
      @confirm="handleRename"
    />
    <PromptDialog
      v-model="deleteOpen"
      title="删除会话"
      message="确定删除此会话吗？消息历史将一并移除，此操作不可撤销。"
      confirm-text="删除"
      danger
      hide-input
      @confirm="handleDelete"
    >
      <template v-if="deleting" #default><span class="sr-only">删除中…</span></template>
    </PromptDialog>

    <VoiceSettingsDialog v-model="voiceSettingsOpen" />
  </div>
</template>

<style scoped>
.chat {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  flex: 1;
  min-height: 0;
}

.chat__body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-radius: var(--radius-xl);
  padding: var(--space-3);
  position: relative;
  overflow: hidden;
}

.chat__scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: var(--space-3) var(--space-2);
  scroll-behavior: smooth;
  /* Keep scroll chained to this pane on mobile so the body/page doesn't bounce. */
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}
.chat__inner {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  max-width: 880px;
  margin: 0 auto;
  width: 100%;
}

.chat__loading {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  justify-content: center;
  padding: var(--space-7);
  font-size: var(--text-sm);
}
.chat__loading .spinner { color: var(--accent-2); font-size: 18px; }

.chat__tools {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  max-width: 880px;
  margin: 0 auto;
  width: 100%;
}

.chat__typing {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  align-self: flex-start;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-lg);
  font-size: var(--text-sm);
}

.chat__error {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0 var(--space-2) var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  background: oklch(64% 0.22 25 / 0.14);
  color: oklch(54% 0.2 25);
  font-size: var(--text-sm);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .chat__error { color: oklch(76% 0.16 25); }
}

.chat__jump {
  position: absolute;
  right: var(--space-5);
  bottom: 120px;
  z-index: 5;
}

.chat__compose {
  padding: var(--space-2) var(--space-1) 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--dur-normal) var(--ease-out-expo);
}
.fade-enter-from,
.fade-leave-to { opacity: 0; }

/* ── Phone + landscape compaction ────────────────────────────────── */
@media (max-width: 640px) {
  .chat { gap: var(--space-2); }
  .chat__body { padding: var(--space-2); border-radius: var(--radius-lg); }
  .chat__compose { padding-top: 0; }
  .chat__jump { right: var(--space-3); bottom: 104px; }
}
@media (orientation: landscape) and (max-height: 500px) {
  .chat { gap: var(--space-2); }
  .chat__body { padding: var(--space-2); border-radius: var(--radius-lg); }
  .chat__scroll { padding: var(--space-2) var(--space-1); }
  .chat__inner { gap: var(--space-3); }
  .chat__jump { bottom: 96px; }
}
</style>
