<script setup lang="ts">
import { computed } from 'vue';

export interface Band {
  label: string;
  value: number;
  color: string;
}

// A ratio against its own total, read left to right rather than around a ring.
// Used where the parts are ordered by desirability rather than by size.
const props = defineProps<{
  headline: string;
  value: number;
  of: number;
  bands: Band[];
  footLeft?: string;
  footRight?: string;
}>();

const ratio = computed(() => (props.of === 0 ? 0 : props.value / props.of));
const pct = computed(() => `${Math.round(ratio.value * 100)}%`);
const shown = computed(() => props.bands.filter((b) => b.value > 0));
</script>

<template>
  <div class="meter">
    <div class="headline">{{ headline }}</div>
    <div class="pct sans num">{{ pct }}</div>

    <div class="track">
      <span class="fill" :style="{ width: `${ratio * 100}%` }" />
    </div>

    <div v-if="footLeft || footRight" class="foot mono">
      <span>{{ footLeft }}</span>
      <span>{{ footRight }}</span>
    </div>

    <ul class="bands">
      <li v-for="b in shown" :key="b.label">
        <span class="dot" :style="{ background: b.color }" />
        <span class="name">{{ b.label }}</span>
        <span class="n mono num">{{ b.value }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.meter { display: flex; flex-direction: column; }

.headline { font-size: 12.5px; color: var(--ink-soft); line-height: 1.5; max-width: 32ch; }
.pct { font-size: 31px; font-weight: 800; letter-spacing: -0.035em; line-height: 1.15; }

.track {
  height: 7px;
  border-radius: 999px;
  background: var(--track);
  overflow: hidden;
  margin: 10px 0 7px;
}
.fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--ramp-4), var(--ramp-2));
}

.foot {
  display: flex;
  justify-content: space-between;
  font-size: 10.5px;
  color: var(--ink-faint);
}

.bands { list-style: none; margin: 16px 0 0; padding: 0; }
.bands li {
  display: grid;
  grid-template-columns: 9px 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 4px 0;
  font-size: 13.5px;
}
.dot { width: 9px; height: 9px; border-radius: 2px; }
.name { color: var(--ink-soft); }
.n { font-size: 12.5px; color: var(--ink); }
</style>
