<script setup lang="ts">
import type { HermesSession } from '~/types/hermes'

const props = defineProps<{
  session: HermesSession
}>()

const emit = defineEmits<{ rename: [id: string]; delete: [id: string] }>()

const { relativeTime } = useTime()

const title = computed(() => {
  const t = props.session.title
  if (t && String(t).trim()) return String(t)
  // Fall back to the first-message preview, then a placeholder.
  if (props.session.preview && String(props.session.preview).trim()) {
    return String(props.session.preview)
  }
  return '新会话'
})

const time = computed(() => {
  if (typeof props.session.last_active === 'number') return relativeTime(props.session.last_active)
  if (typeof props.session.started_at === 'number') return relativeTime(props.session.started_at)
  for (const key of ['updated_at', 'created_at']) {
    const v = (props.session as Record<string, unknown>)[key]
    if (v) return relativeTime(v)
  }
  return ''
})

const source = computed(() => {
  const s = props.session.source
  if (s && String(s).trim()) return String(s)
  return ''
})

const count = computed(() => {
  const c = props.session.message_count
  return typeof c === 'number' ? c : null
})
</script>

<template>
  <div class="card glass glass--interactive stagger" :style="{ '--i': 0 }">
    <NuxtLink :to="`/chat/${session.id}`" class="card__main" :aria-label="`打开会话 ${title}`">
      <span class="card__icon">
        <GlassIcon name="message-square" :size="20" />
      </span>
      <span class="card__body">
        <span class="card__title">{{ title }}</span>
        <span class="card__meta">
          <span v-if="time" class="card__meta-item">
            <GlassIcon name="clock" :size="13" :stroke="2.2" /> {{ time }}
          </span>
          <span v-if="count !== null" class="card__meta-item">
            <GlassIcon name="message-square" :size="13" :stroke="2.2" /> {{ count }}
          </span>
          <span v-if="source" class="chip card__source">{{ source }}</span>
        </span>
      </span>
    </NuxtLink>

    <div class="card__actions">
      <button
        class="glass-btn glass-btn--icon card__btn"
        aria-label="重命名"
        title="重命名"
        @click.prevent="emit('rename', session.id)"
      >
        <GlassIcon name="pencil" :size="16" />
      </button>
      <button
        class="glass-btn glass-btn--icon glass-btn--danger card__btn"
        aria-label="删除"
        title="删除"
        @click.prevent="emit('delete', session.id)"
      >
        <GlassIcon name="trash" :size="16" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.card {
  display: flex;
  align-items: stretch;
  border-radius: var(--radius-lg);
  overflow: hidden;
}
.card__main {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-4);
  flex: 1;
  min-width: 0;
}
.card__icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex: none;
  border-radius: var(--radius-md);
  background: var(--glass-tint-user);
  color: var(--accent-1);
  box-shadow: var(--inner-edge);
}
.card__body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}
.card__title {
  font-weight: 650;
  font-size: var(--text-base);
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.card__meta {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
  color: var(--text-tertiary);
  font-size: var(--text-xs);
}
.card__meta-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.card__source {
  text-transform: uppercase;
  font-size: 10px;
  letter-spacing: 0.04em;
  padding: 2px 8px;
}
.card__actions {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2);
  opacity: 0;
  transition: opacity var(--dur-normal) var(--ease-standard);
}
.card:hover .card__actions,
.card:focus-within .card__actions {
  opacity: 1;
}
.card__btn {
  width: 36px;
  height: 36px;
  padding: 0;
}

@media (max-width: 640px) {
  .card__actions {
    opacity: 1;
  }
  .card__btn {
    backdrop-filter: none;
    background: transparent;
    box-shadow: none;
  }
}
</style>
