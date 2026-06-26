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
  min-height: 100dvh;
  display: flex;
  justify-content: center;
}
.layout__main {
  width: 100%;
  max-width: var(--app-max-width);
  padding: var(--space-4) var(--space-4) var(--space-8);
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
}
@media (max-width: 640px) {
  .layout__main {
    padding: var(--space-3) var(--space-3) var(--space-7);
  }
}
</style>
