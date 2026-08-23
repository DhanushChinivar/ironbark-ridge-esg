<script setup lang="ts">
import { computed } from 'vue';

// One ratio against its own total, not a two-slice pie: the track is the whole,
// the arc is the part, and both are steps of the same hue.
const props = withDefaults(
  defineProps<{
    value: number;
    of: number;
    caption?: string;
    note?: string;
    /** Overrides the percentage in the middle. A share is not always the point. */
    centre?: string;
  }>(),
  { caption: '' },
);

const SIZE = 168;
const STROKE = 22;
const R = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * R;

const ratio = computed(() => (props.of === 0 ? 0 : props.value / props.of));
const dash = computed(() => `${ratio.value * CIRC} ${CIRC}`);
const middle = computed(() => props.centre ?? `${Math.round(ratio.value * 100)}%`);

// The hole is 124px across. A percentage fits at any size; "315 / 315" does not,
// so the type is sized to the string rather than fixed and left to overrun.
const HOLE = SIZE - STROKE * 2;
const centreSize = computed(() =>
  Math.min(30, Math.max(13, Math.round((HOLE - 14) / (middle.value.length * 0.58)))),
);
</script>

<template>
  <div class="meter">
    <svg :viewBox="`0 0 ${SIZE} ${SIZE}`" role="img" :aria-label="`${middle} ${caption}`">
      <g :transform="`rotate(-90 ${SIZE / 2} ${SIZE / 2})`">
        <circle
          :cx="SIZE / 2" :cy="SIZE / 2" :r="R"
          fill="none" stroke="var(--track)" :stroke-width="STROKE"
        />
        <circle
          :cx="SIZE / 2" :cy="SIZE / 2" :r="R"
          fill="none" stroke="var(--ramp-3)" :stroke-width="STROKE"
          :stroke-dasharray="dash" stroke-linecap="round"
        />
      </g>
      <text
        class="centre sans num"
        :x="SIZE / 2"
        :y="SIZE / 2 - 2"
        :style="{ fontSize: `${centreSize}px` }"
      >{{ middle }}</text>
      <text v-if="caption" class="caption" :x="SIZE / 2" :y="SIZE / 2 + 16">{{ caption }}</text>
    </svg>

    <!-- Sits where the donut puts its legend, so the two cards line up. -->
    <div class="side">
      <slot />
      <p v-if="note" class="note">{{ note }}</p>
    </div>
  </div>
</template>

<style scoped>
.meter { display: flex; align-items: center; gap: 26px; flex-wrap: wrap; }
.side { flex: 1 1 200px; min-width: 190px; }
svg { width: 168px; height: 168px; display: block; }
.centre {
  text-anchor: middle;
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
.note { margin: 10px 0 0; font-size: 12.5px; color: var(--ink-faint); }
</style>
