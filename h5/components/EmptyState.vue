<script setup lang="ts">
withDefaults(defineProps<{
  icon?: string
  title?: string
  hint?: string
}>(), {
  icon: 'inbox',
  title: '空空如也',
  hint: ''
})
</script>

<template>
  <div class="empty glass glass--subtle anim-scale-in">
    <span class="empty__icon">
      <GlassIcon :name="icon" :size="34" />
    </span>
    <h3 class="empty__title">{{ title }}</h3>
    <p v-if="hint" class="empty__hint">{{ hint }}</p>
    <div class="empty__actions">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--space-2);
  padding: var(--space-8) var(--space-6);
  border-radius: var(--radius-lg);
}
.empty__icon {
  display: grid;
  place-items: center;
  width: 76px;
  height: 76px;
  border-radius: var(--radius-lg);
  background: var(--accent-gradient);
  color: #fff;
  box-shadow: var(--shadow-md), inset 0 1px 0 rgba(255, 255, 255, 0.5);
  margin-bottom: var(--space-2);
}
.empty__title {
  font-size: var(--text-xl);
  font-weight: 700;
  letter-spacing: -0.01em;
}
.empty__hint {
  color: var(--text-secondary);
  max-width: 42ch;
  font-size: var(--text-sm);
}
.empty__actions {
  margin-top: var(--space-4);
  display: flex;
  gap: var(--space-3);
  flex-wrap: wrap;
  justify-content: center;
}
</style>
