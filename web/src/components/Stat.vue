<script setup lang="ts">
defineProps<{ label: string; value: string; unit?: string; note?: string; tone?: 'oxide' | 'slate' }>();
</script>

<template>
  <div class="stat">
    <div class="eyebrow">{{ label }}</div>
    <div class="value sans num" :class="tone">
      {{ value }}<span v-if="unit" class="unit">{{ unit }}</span>
    </div>
    <div v-if="note" class="note">{{ note }}</div>
  </div>
</template>

<style scoped>
.stat { display: flex; flex-direction: column; gap: 4px; }
.value { font-size: 31px; font-weight: 800; letter-spacing: -0.035em; line-height: 1.05; }
.value.oxide { color: var(--oxide); }
.value.slate { color: var(--slate); }
.unit { font-size: 14px; font-weight: 500; margin-left: 4px; color: var(--ink-faint); }
.note { font-size: 13px; color: var(--ink-soft); }
</style>
