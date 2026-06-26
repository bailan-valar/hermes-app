<script setup lang="ts">
// Root component — global layout + page rendering.
// The aurora background lives here so it persists across route transitions.
</script>

<template>
  <div class="app-shell">
    <!-- Liquid Glass aurora backdrop (fixed, behind everything) -->
    <div class="aurora" aria-hidden="true">
      <span class="aurora__blob aurora__blob--1" />
      <span class="aurora__blob aurora__blob--2" />
      <span class="aurora__blob aurora__blob--3" />
      <span class="aurora__grain" />
    </div>

    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>

    <!-- Transient toast notifications -->
    <ToastHost />
  </div>
</template>
