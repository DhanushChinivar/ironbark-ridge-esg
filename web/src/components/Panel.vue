<script setup lang="ts">
defineProps<{
  title?: string;
  note?: string;
  loading?: boolean;
  error?: string | null;
  /** Renders a numbered marker before the title, for pages that read as steps. */
  step?: number;
}>();
</script>

<template>
  <section class="panel">
    <header v-if="title">
      <h2 class="sans">
        <span v-if="step" class="step mono" aria-hidden="true">{{ step }}</span>
        {{ title }}
      </h2>
      <span v-if="note" class="eyebrow">{{ note }}</span>
    </header>
    <p v-if="loading" class="state">Loading…</p>
    <p v-else-if="error" class="state err">{{ error }}</p>
    <slot v-else />
  </section>
</template>

<style scoped>
.panel { padding: 24px 26px; }
/* The note drops onto its own line rather than squeezing the title, which
   otherwise wraps mid-phrase in a narrow card. */
header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px 16px;
  flex-wrap: wrap;
  margin-bottom: 18px;
}
header h2 { flex: 0 0 auto; }
h2 { margin: 0; font-size: 14.5px; font-weight: 700; display: flex; align-items: center; gap: 10px; }

/* A place for the eye to land on a page of otherwise identical cards. */
.step {
  flex: 0 0 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: var(--track);
  color: var(--ramp-2);
  font-size: 11px;
  font-weight: 700;
}
.state { margin: 0; color: var(--ink-faint); font-size: 14px; }
.err { color: var(--critical); }
</style>
