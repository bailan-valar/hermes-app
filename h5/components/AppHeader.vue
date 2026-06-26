<script setup lang="ts">
withDefaults(defineProps<{
  title?: string
  subtitle?: string
  showBack?: boolean
}>(), {
  title: 'Hermes',
  subtitle: '',
  showBack: false
})

const emit = defineEmits<{ back: [] }>()
</script>

<template>
  <header class="app-header">
    <div class="app-header__inner glass glass--strong">
      <div class="app-header__left">
        <button
          v-if="showBack"
          class="glass-btn glass-btn--icon app-header__back"
          aria-label="返回"
          @click="emit('back')"
        >
          <GlassIcon name="chevron-left" :size="22" />
        </button>

        <NuxtLink v-else to="/" class="app-header__brand" aria-label="Hermes 首页">
          <span class="app-header__logo">
            <GlassIcon name="sparkles" :size="20" :stroke="2.2" />
          </span>
          <span class="app-header__titles">
            <strong class="app-header__title">{{ title }}</strong>
            <small v-if="subtitle" class="app-header__subtitle">{{ subtitle }}</small>
          </span>
        </NuxtLink>
      </div>

      <div class="app-header__right">
        <slot name="actions" />
      </div>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  position: sticky;
  top: var(--space-3);
  z-index: 50;
  padding: 0 var(--space-4);
}
.app-header__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3) var(--space-2) var(--space-4);
  border-radius: var(--radius-full);
  min-height: 56px;
}

.app-header__left {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}
.app-header__brand {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}
.app-header__logo {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: var(--radius-sm);
  background: var(--accent-gradient);
  color: #fff;
  box-shadow: var(--shadow-sm), inset 0 1px 0 rgba(255, 255, 255, 0.5);
  flex: none;
}
.app-header__titles {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
  min-width: 0;
}
.app-header__title {
  font-size: var(--text-lg);
  font-weight: 700;
  letter-spacing: -0.01em;
}
.app-header__subtitle {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 46vw;
}
.app-header__right {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

@media (max-width: 560px) {
  .app-header__subtitle {
    display: none;
  }
}
</style>
