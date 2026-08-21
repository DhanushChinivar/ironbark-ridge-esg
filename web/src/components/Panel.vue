<script setup lang="ts">
defineProps<{ title?: string; note?: string; loading?: boolean; error?: string | null }>();
</script>

<template>
  <section class="panel">
    <header v-if="title">
      <h2 class="sans">{{ title }}</h2>
      <span v-if="note" class="eyebrow">{{ note }}</span>
    </header>
    <p v-if="loading" class="state">Loading…</p>
    <p v-else-if="error" class="state err">{{ error }}</p>
    <slot v-else />
  </section>
</template>

<style scoped>
.panel { padding: 24px 26px; }
header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}
h2 { margin: 0; font-size: 15px; font-weight: 600; letter-spacing: -0.005em; }
.state { margin: 0; color: var(--ink-faint); font-size: 14px; }
.err { color: var(--critical); }
</style>
