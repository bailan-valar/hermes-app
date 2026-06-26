<script setup lang="ts">
import type { ToolProgress } from '~/types/hermes'

defineProps<{
  tool: ToolProgress
}>()
</script>

<template>
  <div class="tool chip" :class="`tool--${tool.status}`">
    <span class="tool__icon">
      <GlassIcon v-if="tool.status === 'running'" name="wrench" :size="13" :stroke="2.2" />
      <GlassIcon v-else-if="tool.status === 'completed'" name="check-circle" :size="13" :stroke="2.2" />
      <GlassIcon v-else name="alert-triangle" :size="13" :stroke="2.2" />
    </span>
    <span class="tool__name">{{ tool.name }}</span>
    <span v-if="tool.status === 'running'" class="tool__spinner spinner" />
  </div>
</template>

<style scoped>
.tool {
  color: var(--accent-2);
  animation: fade-in var(--dur-fast) var(--ease-out-expo) both;
}
.tool--completed {
  color: oklch(60% 0.16 145);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .tool--completed { color: oklch(76% 0.15 145); }
}
.tool--failed {
  color: oklch(60% 0.2 25);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .tool--failed { color: oklch(74% 0.18 25); }
}
.tool__icon { display: inline-flex; }
.tool__name {
  font-family: var(--font-mono);
  font-size: 11px;
}
.tool__spinner {
  width: 11px;
  height: 11px;
  border-width: 1.5px;
}
</style>
