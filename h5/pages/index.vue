<script setup lang="ts">
useHead({ title: '会话历史 · Hermes' })

const { sessions, loading, error, refresh, create, remove, rename, findById } = useSessions()
const hermes = useHermes()

const query = ref('')
const creating = ref(false)
const toast = useToast()

// Rename dialog state
const renameOpen = ref(false)
const renameId = ref<string | null>(null)
const renameInitial = ref('')

// Delete dialog state
const deleteOpen = ref(false)
const deleteId = ref<string | null>(null)
const deleting = ref(false)

// Model selection state
const modelSelectOpen = ref(false)
const modelsLoading = ref(false)
const availableModels = ref<{ id: string }[]>([])
const selectedModel = ref('')

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return sessions.value
  return sessions.value.filter((s) => {
    const title = String(s.title ?? '').toLowerCase()
    const source = String(s.source ?? '').toLowerCase()
    return title.includes(q) || source.includes(q)
  })
})

async function handleCreate() {
  if (creating.value) return
  // Open model selection dialog
  modelSelectOpen.value = true
}

async function handleCreateWithModel() {
  if (creating.value) return
  creating.value = true
  try {
    const session = await create(undefined, selectedModel.value || undefined)
    await navigateTo(`/chat/${session.id}`)
  } catch (e) {
    toast.error(errText(e))
  } finally {
    creating.value = false
  }
}

function openRename(id: string) {
  const s = findById(id)
  renameId.value = id
  renameInitial.value = String(s?.title ?? '')
  renameOpen.value = true
}

async function handleRename(title: string) {
  if (!renameId.value) return
  try {
    await rename(renameId.value, title)
    toast.success('已重命名')
  } catch (e) {
    toast.error('重命名失败：' + errText(e))
  }
}

function openDelete(id: string) {
  deleteId.value = id
  deleteOpen.value = true
}

async function handleDelete() {
  if (!deleteId.value) return
  deleting.value = true
  try {
    await remove(deleteId.value)
    toast.success('已删除')
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

onMounted(async () => {
  await refresh(true)
  // Fetch available models
  modelsLoading.value = true
  try {
    availableModels.value = await hermes.listModels()
    // Set default to first model if available
    if (availableModels.value.length > 0) {
      selectedModel.value = availableModels.value[0].id
    }
  } catch (e) {
    // Silently fail — model selection is optional
    console.error('Failed to load models:', e)
  } finally {
    modelsLoading.value = false
  }
})
</script>

<template>
  <div class="page">
    <AppHeader title="Hermes" subtitle="Liquid Glass · 会话客户端">
      <template #actions>
        <HealthPill />
        <button
          class="glass-btn glass-btn--icon"
          aria-label="刷新"
          title="刷新会话列表"
          :disabled="loading"
          @click="refresh(true)"
        >
          <GlassIcon name="refresh" :size="18" :class="{ spinning: loading }" />
        </button>
        <button
          class="glass-btn glass-btn--primary"
          :disabled="creating"
          @click="handleCreate"
        >
          <GlassIcon name="plus" :size="18" :stroke="2.4" />
          <span>新增会话</span>
        </button>
      </template>
    </AppHeader>

    <section class="page__body">
      <!-- Search -->
      <div class="search glass glass--subtle">
        <GlassIcon name="search" :size="18" class="search__icon" />
        <input
          v-model="query"
          class="search__input"
          type="search"
          placeholder="搜索会话标题或来源…"
          aria-label="搜索会话"
        >
        <span v-if="filtered.length" class="search__count chip">{{ filtered.length }}</span>
      </div>

      <!-- Error state -->
      <div v-if="error && !loading && !sessions.length" class="state glass glass--subtle">
        <span class="state__icon state__icon--bad"><GlassIcon name="alert-triangle" :size="30" /></span>
        <h3 class="state__title">无法加载会话</h3>
        <p class="state__msg">{{ error }}</p>
        <p class="state__hint">
          请确认 Hermes API server 已启动（默认
          <code class="mono">http://127.0.0.1:8642</code>）且
          <code class="mono">HERMES_API_KEY</code> 配置正确。
        </p>
        <button class="glass-btn glass-btn--primary" @click="refresh(true)">
          <GlassIcon name="refresh" :size="16" /> 重试
        </button>
      </div>

      <!-- Loading skeletons -->
      <div v-else-if="loading && !sessions.length" class="list stagger">
        <div v-for="i in 5" :key="i" class="skeleton-card glass glass--subtle" :style="{ '--i': i - 1 }">
          <div class="skeleton skeleton-card__icon" />
          <div class="skeleton-card__lines">
            <div class="skeleton skeleton-card__line" style="width: 45%" />
            <div class="skeleton skeleton-card__line" style="width: 25%" />
          </div>
        </div>
      </div>

      <!-- Empty -->
      <EmptyState
        v-else-if="!filtered.length && !query"
        icon="message-plus"
        title="还没有会话"
        hint="创建第一个会话，开始与 Hermes agent 对话。支持终端、文件、网页搜索等完整工具集。"
      >
        <button class="glass-btn glass-btn--primary" :disabled="creating" @click="handleCreate">
          <GlassIcon name="plus" :size="18" :stroke="2.4" /> 新增会话
        </button>
      </EmptyState>

      <EmptyState
        v-else-if="!filtered.length && query"
        icon="search"
        title="没有匹配的会话"
        :hint="`没有找到包含 “${query}” 的会话`"
      />

      <!-- Session list -->
      <div v-else class="list stagger">
        <SessionCard
          v-for="(session, i) in filtered"
          :key="session.id"
          :session="session"
          :style="{ '--i': Math.min(i, 12) }"
          @rename="openRename"
          @delete="openDelete"
        />
      </div>
    </section>

    <!-- Rename dialog -->
    <PromptDialog
      v-model="renameOpen"
      title="重命名会话"
      label="会话标题"
      :initial-value="renameInitial"
      placeholder="输入新的会话标题"
      confirm-text="保存"
      @confirm="handleRename"
    />

    <!-- Delete confirmation -->
    <PromptDialog
      v-model="deleteOpen"
      title="删除会话"
      message="确定删除此会话吗？该会话的消息历史将一并移除，此操作不可撤销。"
      confirm-text="删除"
      danger
      hide-input
      @confirm="handleDelete"
    >
      <template v-if="deleting" #default>
        <span class="sr-only">删除中…</span>
      </template>
    </PromptDialog>

    <!-- Model selection dialog -->
    <ModelSelectDialog
      v-model="modelSelectOpen"
      :models="availableModels"
      :loading="modelsLoading"
      :initial-model="selectedModel"
      @confirm="handleCreateWithModel"
    />
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.page__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.search {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-full);
  color: var(--text-tertiary);
}
.search__icon { flex: none; }
.search__input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  font-size: var(--text-base);
  color: var(--text-primary);
  padding: var(--space-2) 0;
}
.search__input::placeholder { color: var(--text-tertiary); }
.search__count { flex: none; }

.list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--space-2);
  padding: var(--space-7);
  border-radius: var(--radius-lg);
}
.state__icon {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  border-radius: var(--radius-lg);
  margin-bottom: var(--space-1);
}
.state__icon--bad {
  background: oklch(64% 0.22 25 / 0.18);
  color: oklch(60% 0.22 25);
}
.state__title { font-size: var(--text-xl); font-weight: 700; }
.state__msg { color: var(--text-secondary); font-weight: 500; }
.state__hint {
  color: var(--text-tertiary);
  font-size: var(--text-sm);
  max-width: 48ch;
  line-height: 1.6;
}
.state__hint code {
  background: var(--glass-fill-subtle);
  padding: 1px 6px;
  border-radius: 6px;
  font-size: 0.85em;
}
.state button { margin-top: var(--space-3); }

.skeleton-card {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4);
  border-radius: var(--radius-lg);
  height: 68px;
}
.skeleton-card__icon { width: 44px; height: 44px; flex: none; border-radius: var(--radius-md); }
.skeleton-card__lines { flex: 1; display: flex; flex-direction: column; gap: var(--space-2); }
.skeleton-card__line { height: 14px; border-radius: var(--radius-xs); }

.spinning { animation: spin 0.8s linear infinite; }
</style>
