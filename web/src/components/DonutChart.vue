<script setup lang="ts">
import { computed, ref } from 'vue';

export interface Segment {
  label: string;
  value: number;
  color: string;
}

const props = withDefaults(
  defineProps<{
    segments: Segment[];
    centreValue: string;
    centreCaption?: string;
    /** Unit shown after each legend count. */
    unit?: string;
  }>(),
  { unit: '' },
);

const SIZE = 168;
const STROKE = 22;
const R = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * R;

// A 2px gap on the surface between neighbouring segments. Without it two
// similar rungs of the same ramp meet edge to edge and read as one arc.
const GAP = 2;

const total = computed(() => props.segments.reduce((a, s) => a + s.value, 0));
const hovered = ref<number | null>(null);

const arcs = computed(() => {
  const t = total.value;
  if (t === 0) return [];
  let offset = 0;
  return props.segments.map((s, i) => {
    const length = (s.value / t) * CIRC;
    const arc = {
      ...s,
      index: i,
      // Never let the gap eat a segment whole; a one-count slice must stay visible.
      dash: `${Math.max(length - GAP, 1)} ${CIRC - Math.max(length - GAP, 1)}`,
      offset: -offset,
      share: s.value / t,
    };
    offset += length;
    return arc;
  });
});

const share = (n: number) => `${Math.round(n * 100)}%`;
</script>

<template>
  <div class="donut">
    <div class="ring">
      <svg :viewBox="`0 0 ${SIZE} ${SIZE}`" role="img" :aria-label="`${centreValue} ${centreCaption ?? ''}`">
        <g :transform="`rotate(-90 ${SIZE / 2} ${SIZE / 2})`">
          <circle
            :cx="SIZE / 2"
            :cy="SIZE / 2"
            :r="R"
            fill="none"
            stroke="var(--track)"
            :stroke-width="STROKE"
          />
          <circle
            v-for="a in arcs"
            :key="a.label"
            :cx="SIZE / 2"
            :cy="SIZE / 2"
            :r="R"
            fill="none"
            :stroke="a.color"
            :stroke-width="STROKE"
            :stroke-dasharray="a.dash"
            :stroke-dashoffset="a.offset"
            :opacity="hovered === null || hovered === a.index ? 1 : 0.3"
            @mouseenter="hovered = a.index"
            @mouseleave="hovered = null"
          />
        </g>
        <text class="centre sans num" :x="SIZE / 2" :y="SIZE / 2 - 2">{{ centreValue }}</text>
        <text v-if="centreCaption" class="caption" :x="SIZE / 2" :y="SIZE / 2 + 16">
          {{ centreCaption }}
        </text>
      </svg>
    </div>

    <!-- Identity is never colour alone: every segment is named here with its
         own count, which is also the only place the exact numbers appear. -->
    <ul class="legend">
      <li
        v-for="a in arcs"
        :key="a.label"
        :class="{ dim: hovered !== null && hovered !== a.index }"
        @mouseenter="hovered = a.index"
        @mouseleave="hovered = null"
      >
        <span class="swatch" :style="{ background: a.color }" />
        <span class="name">{{ a.label }}</span>
        <span class="pct mono num">{{ share(a.share) }}</span>
        <span class="count mono num">{{ a.value }}{{ unit }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.donut { display: flex; align-items: center; justify-content: center; gap: 22px 26px; flex-wrap: wrap; }
.ring { flex: 0 0 auto; }
svg { width: 168px; height: 168px; display: block; }
circle[stroke-dasharray] { transition: opacity 0.12s ease; }

.centre {
  text-anchor: middle;
  font-size: 27px;
  font-weight: 700;
  letter-spacing: -0.02em;
  fill: var(--ink);
}
.caption {
  text-anchor: middle;
  font-family: 'JetBrains Mono', monospace;
  font-size: 9.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  fill: var(--ink-faint);
}

.legend { list-style: none; margin: 0; padding: 0; flex: 1 1 190px; min-width: 180px; }
.legend li {
  display: grid;
  grid-template-columns: 10px 1fr auto auto;
  align-items: center;
  gap: 10px;
  padding: 5px 0;
  font-size: 13.5px;
}
.legend li.dim { opacity: 0.45; }
.swatch { width: 10px; height: 10px; border-radius: 2px; }
.name { color: var(--ink-soft); }
.pct { font-size: 11.5px; color: var(--ink-faint); }
.count { font-size: 12.5px; color: var(--ink); min-width: 30px; text-align: right; }
</style>
