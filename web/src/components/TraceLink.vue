<script setup lang="ts">
import { RouterLink } from 'vue-router';

// The sub-tab is easy to miss on a first pass, and the page it hides is the one
// that makes the traceability claim concrete. So the invitation also sits where
// the figures are, phrased as what the reader gets rather than where it lives.
defineProps<{ to: string; lede: string; cta: string }>();
</script>

<template>
  <RouterLink :to="to" class="trace">
    <span class="mark" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path d="M4 5h9M4 10h13M4 15h7" />
        <path d="M15 19h5m0 0-2.5-2.5M20 19l-2.5 2.5" />
      </svg>
    </span>
    <span class="copy">
      <b class="sans">{{ cta }}</b>
      <span class="lede">{{ lede }}</span>
    </span>
    <span class="go sans" aria-hidden="true">→</span>
  </RouterLink>
</template>

<style scoped>
.trace {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  border-radius: 16px;
  text-decoration: none;
  color: inherit;
  background: linear-gradient(
    100deg,
    color-mix(in srgb, var(--ramp-4) 13%, var(--panel)),
    var(--panel) 70%
  );
  border: 1px solid var(--panel-edge);
  box-shadow: var(--lift);
  transition: transform 0.16s ease, box-shadow 0.16s ease;
}
.trace:hover { transform: translateY(-1px); box-shadow: var(--lift-hover, var(--lift)); }
.trace:hover .go { transform: translateX(3px); }

.mark {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex: none;
  border-radius: 10px;
  background: color-mix(in srgb, var(--ramp-3) 16%, transparent);
}
.mark svg {
  width: 19px;
  height: 19px;
  fill: none;
  stroke: var(--ramp-2);
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.copy b { font-size: 14.5px; font-weight: 700; color: var(--ramp-1); }
.lede { font-size: 12.5px; color: var(--ink-soft); }

.go {
  margin-left: auto;
  font-size: 17px;
  color: var(--ramp-2);
  transition: transform 0.16s ease;
}

@media print { .trace { display: none; } }
</style>
