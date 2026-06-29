<script setup lang="ts">
// Default layout — centered column with comfortable max width.
</script>

<template>
  <div class="layout">
    <main class="layout__main">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.layout {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  overflow: hidden;
}
.layout__main {
  width: 100%;
  max-width: var(--app-max-width);
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  /* Gutters + per-edge safe-area insets (notch / home indicator). env() is 0 on
     devices without insets, so this is a no-op on desktop. */
  padding:
    calc(var(--space-4) + env(safe-area-inset-top))
    calc(var(--space-4) + env(safe-area-inset-right))
    calc(var(--space-8) + env(safe-area-inset-bottom))
    calc(var(--space-4) + env(safe-area-inset-left));
}
@media (max-width: 640px) {
  .layout__main {
    /* Tighter gutters on phones; composer stays within thumb reach above the
       home indicator. */
    padding:
      calc(var(--space-3) + env(safe-area-inset-top))
      calc(var(--space-3) + env(safe-area-inset-right))
      calc(var(--space-5) + env(safe-area-inset-bottom))
      calc(var(--space-3) + env(safe-area-inset-left));
  }
}
/* In landscape the vertical budget is tiny — shed all non-essential padding. */
@media (orientation: landscape) and (max-height: 500px) {
  .layout__main {
    padding:
      calc(var(--space-2) + env(safe-area-inset-top))
      calc(var(--space-3) + env(safe-area-inset-right))
      calc(var(--space-3) + env(safe-area-inset-bottom))
      calc(var(--space-3) + env(safe-area-inset-left));
  }
}
</style>
