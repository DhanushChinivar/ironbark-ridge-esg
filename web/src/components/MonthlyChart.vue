<script setup lang="ts">
import { computed, ref } from 'vue';
import type { MonthlyEmissions } from '@contracts';

export type Focus = 'both' | 'scope1' | 'scope2';

const props = withDefaults(
  defineProps<{ months: MonthlyEmissions['months']; focus?: Focus }>(),
  { focus: 'both' },
);

const W = 900;
const H = 286;
// Room on the left for the rotated axis title, and below for the axis name
// under the month ticks.
const PAD = { top: 12, right: 8, bottom: 52, left: 64 };

const hovered = ref<number | null>(null);

// Always the stacked total, never the focused series. Rescaling per tab would
// let Scope 1 and Scope 2 fill the same height on their own tabs, and the
// March spike - the largest Scope 1 month in the period - would look ordinary.
const max = computed(() => Math.max(...props.months.map((m) => m.totalTco2e), 1));
const plotW = W - PAD.left - PAD.right;
const plotH = H - PAD.top - PAD.bottom;
const band = computed(() => plotW / props.months.length);
const stacked = computed(() => props.focus === 'both');
const barW = computed(() => Math.min(band.value * 0.52, 26));

// Rounded at the free end, square where it meets the baseline or the segment
// below. A plain rx would round all four corners and lift the bar off its axis.
function capped(x: number, y: number, w: number, h: number, r = 4): string {
  const radius = Math.min(r, w / 2, Math.max(h, 0));
  if (h <= 0) return '';
  return [
    `M${x} ${y + h}`,
    `V${y + radius}`,
    `A${radius} ${radius} 0 0 1 ${x + radius} ${y}`,
    `H${x + w - radius}`,
    `A${radius} ${radius} 0 0 1 ${x + w} ${y + radius}`,
    `V${y + h}`,
    'Z',
  ].join(' ');
}

const y = (v: number) => PAD.top + plotH - (v / max.value) * plotH;
const height = (v: number) => plotH - (y(v) - PAD.top);

const x = (i: number) => PAD.left + i * band.value + (band.value - barW.value) / 2;
const fade = (i: number) => (hovered.value === null || hovered.value === i ? 1 : 0.3);

// A single scope shows only itself. That is safe here only because the stacked
// chart sits beside it carrying the comparison - alone, a Scope 1 chart spiking
// in March 2026 would look unexplained.
const solo = (m: MonthlyEmissions['months'][number]) =>
  props.focus === 'scope1' ? m.scope1Tco2e : m.scope2Tco2e;

// Marked only where the missing series is one this chart actually draws. Fuel
// is absent in Nov 2025, which says nothing about the electricity chart.
const missing = (m: MonthlyEmissions['months'][number]) => {
  if (props.focus === 'scope1') return !m.hasFuelData;
  if (props.focus === 'scope2') return !m.hasElectricityData;
  return !m.hasFuelData || !m.hasElectricityData;
};

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

      <!-- Named axes: the tick numbers alone never say what is being measured. -->
      <text
        class="axis-title"
        :transform="`rotate(-90 14 ${PAD.top + plotH / 2})`"
        :x="14"
        :y="PAD.top + plotH / 2"
      >
        <tspan class="unit-case">t CO₂e</tspan>
      </text>
      <text class="axis-title" :x="PAD.left + plotW / 2" :y="H - 6">Month</text>

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
        <template v-if="stacked">
          <path
            class="s2"
            :d="capped(x(i), y(m.scope2Tco2e), barW, height(m.scope2Tco2e))"
            :opacity="fade(i)"
          />
          <!-- 2px short of the segment below it, so the two scopes stay two marks
               rather than merging into one column. -->
          <path
            class="s1"
            :d="capped(x(i), y(m.totalTco2e), barW, y(m.scope2Tco2e) - y(m.totalTco2e) - 2)"
            :opacity="fade(i)"
          />
        </template>
        <path
          v-else
          :class="focus"
          :d="capped(x(i), y(solo(m)), barW, height(solo(m)))"
          :opacity="fade(i)"
        />
        <!-- A month with no fuel data is marked, not left to read as zero. -->
        <text
          v-if="missing(m)"
          class="gap"
          :x="PAD.left + i * band + band / 2"
          :y="y(stacked ? m.scope2Tco2e : 0) - 7"
        >
          no data
        </text>
        <text class="month" :x="PAD.left + i * band + band / 2" :y="H - 32">
          {{ m.month.slice(5) }}
        </text>
        <text
          v-if="m.month.endsWith('-01')"
          class="year"
          :x="PAD.left + i * band + band / 2"
          :y="H - 43"
        >
          {{ m.month.slice(0, 4) }}
        </text>
      </g>
    </svg>

    <!-- The key names only what is actually drawn. A Scope 2 swatch under a
         Scope 1 chart claims a series that is not there. -->
    <div class="readout mono" :class="{ dim: hovered === null }">
      <template v-if="hovered !== null && months[hovered]">
        <b>{{ months[hovered]!.month }}</b>
        <template v-if="stacked">
          <span class="k s1">Scope 1</span> {{ fmt(months[hovered]!.scope1Tco2e) }} t CO₂e
          <span class="k s2">Scope 2</span> {{ fmt(months[hovered]!.scope2Tco2e) }} t CO₂e
          <span class="k">Total</span> {{ fmt(months[hovered]!.totalTco2e) }} t CO₂e
        </template>
        <template v-else>
          <span class="k" :class="focus === 'scope1' ? 's1' : 's2'">
            {{ focus === 'scope1' ? 'Scope 1' : 'Scope 2' }}
          </span>
          {{ fmt(solo(months[hovered]!)) }} t CO₂e
        </template>
        <span v-if="!months[hovered]!.hasFuelData" class="warn">no fuel deliveries recorded</span>
      </template>

      <template v-else-if="stacked">
        <span class="k s1">Scope 1</span> fuel
        <span class="k s2">Scope 2</span> electricity — hover a month
      </template>
      <template v-else>
        <span class="k" :class="focus === 'scope1' ? 's1' : 's2'">
          {{ focus === 'scope1' ? 'Scope 1' : 'Scope 2' }}
        </span>
        {{ focus === 'scope1' ? 'fuel' : 'electricity' }} — hover a month
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
.s1, .scope1 { fill: var(--scope1); }
.s2, .scope2 { fill: var(--scope2); }

.month, .year {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9.5px;
  fill: var(--ink-faint);
  text-anchor: middle;
}
.year { font-weight: 700; fill: var(--ink-soft); }

/* A chemical formula is not a word: uppercasing it turns CO₂e into CO₂E. */
.unit-case { text-transform: none; }

.axis-title {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9.5px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  fill: var(--ink-faint);
  text-anchor: middle;
}

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
