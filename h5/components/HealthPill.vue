<script setup lang="ts">
/**
 * Polls the proxy /health endpoint and shows connection state.
 * Keeps the user informed when the Hermes API server is down or misconfigured.
 */
const hermes = useHermes()
const ok = ref<boolean | null>(null)
const checking = ref(false)

async function check() {
  checking.value = true
  const res = await hermes.health()
  ok.value = res.ok
  checking.value = false
}

onMounted(() => {
  check()
  // Light polling — every 30s, only while the tab is visible.
  const id = window.setInterval(() => {
    if (document.visibilityState === 'visible') check()
  }, 30_000)
  onBeforeUnmount(() => window.clearInterval(id))
})

const label = computed(() => {
  if (checking.value && ok.value === null) return '检测中'
  return ok.value ? '已连接' : '未连接'
})
</script>

<template>
  <button
    class="pill"
    :class="{
      'pill--ok': ok === true,
      'pill--bad': ok === false,
      'pill--unknown': ok === null
    }"
    :title="ok ? 'Hermes API server 在线' : '无法连接 Hermes API server，点击重试'"
    @click="check"
  >
    <span class="pill__dot" />
    <span class="pill__label">{{ label }}</span>
  </button>
</template>

<style scoped>
.pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 13px;
  font-size: var(--text-xs);
  font-weight: 600;
  border-radius: var(--radius-full);
  background: var(--glass-fill-subtle);
  border: 1px solid var(--glass-border);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  color: var(--text-secondary);
  transition: transform var(--dur-fast) var(--ease-spring);
}
.pill:hover { transform: translateY(-1px); }

.pill__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-tertiary);
  transition: background var(--dur-normal) var(--ease-standard);
}
.pill--ok .pill__dot {
  background: oklch(72% 0.19 145);
  box-shadow: 0 0 0 3px oklch(72% 0.19 145 / 0.25);
  animation: pulse-ring 2s infinite;
}
.pill--bad .pill__dot {
  background: oklch(64% 0.22 25);
  box-shadow: 0 0 0 3px oklch(64% 0.22 25 / 0.25);
}
.pill--ok { color: oklch(48% 0.16 145); }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .pill--ok { color: oklch(78% 0.16 145); }
}
.pill--bad { color: oklch(54% 0.2 25); }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .pill--bad { color: oklch(74% 0.18 25); }
}
</style>
