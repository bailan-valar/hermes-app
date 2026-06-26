<script setup lang="ts">
const { toasts, dismiss } = useToast()
</script>

<template>
  <ClientOnly>
    <Teleport to="body">
      <TransitionGroup tag="div" name="toast" class="toast-host">
      <div
        v-for="t in toasts"
        :key="t.id"
        class="toast glass glass--strong"
        :class="`toast--${t.type}`"
        role="status"
        @click="dismiss(t.id)"
      >
        <span class="toast__icon">
          <GlassIcon
            :name="t.type === 'error' ? 'alert-triangle' : t.type === 'success' ? 'check-circle' : 'sparkles'"
            :size="17"
            :stroke="2.2"
          />
        </span>
        <span class="toast__msg">{{ t.message }}</span>
      </div>
      </TransitionGroup>
    </Teleport>
  </ClientOnly>
</template>

<style scoped>
.toast-host {
  position: fixed;
  top: calc(env(safe-area-inset-top) + var(--space-4));
  left: 50%;
  transform: translateX(-50%);
  z-index: 200;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  align-items: center;
  pointer-events: none;
}
.toast {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-full);
  font-size: var(--text-sm);
  font-weight: 500;
  max-width: min(90vw, 460px);
  pointer-events: auto;
  cursor: pointer;
  box-shadow: var(--shadow-lg), var(--inner-highlight), var(--inner-edge);
}
.toast__icon { display: inline-flex; flex: none; }
.toast--error .toast__icon { color: oklch(60% 0.22 25); }
.toast--success .toast__icon { color: oklch(60% 0.16 145); }
.toast--info .toast__icon { color: var(--accent-2); }

.toast-enter-active,
.toast-leave-active {
  transition: all var(--dur-normal) var(--ease-spring);
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(-16px) scale(0.9);
}
.toast-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.95);
}
.toast-move {
  transition: transform var(--dur-normal) var(--ease-spring);
}
</style>
