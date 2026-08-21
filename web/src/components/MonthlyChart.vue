<script setup lang="ts">
import { computed, ref } from 'vue';
import type { MonthlyEmissions } from '@contracts';

const props = defineProps<{ months: MonthlyEmissions['months'] }>();

const W = 900;
const H = 260;
const PAD = { top: 12, right: 8, bottom: 30, left: 46 };

const hovered = ref<number | null>(null);

const max = computed(() => Math.max(...props.months.map((m) => m.totalTco2e), 1));
const plotW = W - PAD.left - PAD.right;
const plotH = H - PAD.top - PAD.bottom;
const band = computed(() => plotW / props.months.length);
const barW = computed(() => Math.min(band.value * 0.62, 34));

const y = (v: number) => PAD.top + plotH - (v / max.value) * plotH;
const x = (i: number) => PAD.left + i * band.value + (band.value - barW.value) / 2;

// Round hundreds for gridlines rather than a fixed count, so the labels are
// numbers a person would actually say.
const ticks = computed(() => {
  const step = max.value > 4000 ? 1000 : 500;
  const out: number[] = [];
  for (let v = 0; v <= max.value; v += step) out.push(v);
  return out;
});

const fmt = (n: number) => n.toLocaleString('en-AU', { maximumFractionDigits: 0 });
</script>

<template>
  <div class="wrap">
    <svg :viewBox="`0 0 ${W} ${H}`" role="img" aria-label="Monthly emissions by scope">
      <g class="grid">
        <template v-for="tick in ticks" :key="tick">
          <line :x1="PAD.left" :x2="W - PAD.right" :y1="y(tick)" :y2="y(tick)" />
          <text :x="PAD.left - 8" :y="y(tick) + 4" text-anchor="end">{{ fmt(tick) }}</text>
        </template>
      </g>

      <g v-for="(m, i) in months" :key="m.month">
        <rect
          class="hit"
          :x="PAD.left + i * band"
          :y="PAD.top"
          :width="band"
          :height="plotH"
          @mouseenter="hovered = i"
          @mouseleave="hovered = null"
        />
        <rect
          class="s2"
          :x="x(i)"
          :y="y(m.scope2Tco2e)"
          :width="barW"
          :height="plotH - (y(m.scope2Tco2e) - PAD.top)"
          :opacity="hovered === null || hovered === i ? 1 : 0.35"
        />
        <rect
          class="s1"
          :x="x(i)"
          :y="y(m.totalTco2e)"
          :width="barW"
          :height="y(m.scope2Tco2e) - y(m.totalTco2e)"
          :opacity="hovered === null || hovered === i ? 1 : 0.35"
        />
        <!-- A month with no fuel data is marked, not left to read as zero. -->
        <text v-if="!m.hasFuelData" class="gap" :x="x(i) + barW / 2" :y="y(m.scope2Tco2e) - 7">
          no data
        </text>
        <text class="month" :x="x(i) + barW / 2" :y="H - 10">{{ m.month.slice(5) }}</text>
        <text v-if="m.month.endsWith('-01')" class="year" :x="x(i) + barW / 2" :y="H - 21">
          {{ m.month.slice(0, 4) }}
        </text>
      </g>
    </svg>

    <div class="readout mono" :class="{ dim: hovered === null }">
      <template v-if="hovered !== null && months[hovered]">
        <b>{{ months[hovered]!.month }}</b>
        <span class="k s1">Scope 1</span> {{ fmt(months[hovered]!.scope1Tco2e) }} t
        <span class="k s2">Scope 2</span> {{ fmt(months[hovered]!.scope2Tco2e) }} t
        <span class="k">Total</span> {{ fmt(months[hovered]!.totalTco2e) }} t
        <span v-if="!months[hovered]!.hasFuelData" class="warn">no fuel deliveries recorded</span>
      </template>
      <template v-else>
        <span class="k s1">Scope 1</span> fuel
        <span class="k s2">Scope 2</span> electricity — hover a month
      </template>
    </div>
  </div>
</template>

<style scoped>
.wrap { display: flex; flex-direction: column; gap: 10px; }
svg { width: 100%; height: auto; display: block; }

.grid line { stroke: var(--rule); stroke-width: 1; }
.grid text { font-family: 'JetBrains Mono', monospace; font-size: 10px; fill: var(--ink-faint); }

.hit { fill: transparent; }
.s1 { fill: var(--scope1); }
.s2 { fill: var(--scope2); }

.month, .year {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9.5px;
  fill: var(--ink-faint);
  text-anchor: middle;
}
.year { font-weight: 700; fill: var(--ink-soft); }

.gap {
  font-family: 'JetBrains Mono', monospace;
  font-size: 8.5px;
  fill: var(--amber);
  text-anchor: middle;
}

.readout {
  font-size: 12px;
  color: var(--ink-soft);
  border-top: 1px solid var(--rule);
  padding-top: 10px;
  min-height: 22px;
}
.readout.dim { color: var(--ink-faint); }
.readout b { color: var(--ink); margin-right: 10px; }

.k {
  display: inline-block;
  margin: 0 5px 0 14px;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.k::before {
  content: '';
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 5px;
  background: currentColor;
  border-radius: 1px;
}
.k.s1 { color: var(--scope1); }
.k.s2 { color: var(--scope2); }
.k:not(.s1):not(.s2)::before { display: none; }

.warn { color: var(--amber); margin-left: 14px; }
</style>
