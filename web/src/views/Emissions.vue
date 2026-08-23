<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Basis, MonthlyEmissions } from '@contracts';
import { api } from '../api';
import Panel from '../components/Panel.vue';
import Stat from '../components/Stat.vue';
import MonthlyChart, { type Focus } from '../components/MonthlyChart.vue';
import SubTabs from '../components/SubTabs.vue';
import TraceLink from '../components/TraceLink.vue';

const tabs = [
  { to: '/emissions', label: 'Figures' },
  { to: '/emissions/calculation', label: 'How this value was calculated' },
];

const basis = ref<Basis>('corrected');
const data = ref<MonthlyEmissions | null>(null);
const error = ref<string | null>(null);
const loading = ref(true);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    data.value = await api.emissions(basis.value);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}
watch(basis, load, { immediate: true });

// Three charts rather than one with a switch. Combined answers "what is the
// total and how is it split"; the two singles answer "how is this scope moving",
// which a stacked bar cannot because the upper series has no fixed baseline.
const charts: { focus: Focus; title: string; note: string }[] = [
  { focus: 'both', title: 'Combined', note: 'stacked, total and mix' },
  { focus: 'scope1', title: 'Scope 1 — fuel', note: 'diesel deliveries' },
  { focus: 'scope2', title: 'Scope 2 — electricity', note: 'metered grid supply' },
];

const t = (n: number) => n.toLocaleString('en-AU', { maximumFractionDigits: 0 });
const correction = computed(() => data.value?.correction);
</script>

<template>
  <div class="page">
    <div class="head">
      <div>
        <h1 class="sans">Emissions</h1>
        <p class="lede">
          Scope 1 from fuel deliveries, Scope 2 from metered electricity, each multiplied by the
          emission factor recorded against it at load time.
        </p>
      </div>
      <div class="toggle">
        <span class="eyebrow">Basis</span>
        <div>
          <button :aria-pressed="basis === 'corrected'" @click="basis = 'corrected'">Corrected</button>
          <button :aria-pressed="basis === 'as_reported'" @click="basis = 'as_reported'">
            As reported
          </button>
        </div>
      </div>
    </div>

    <SubTabs :tabs="tabs" />

    <Panel :loading="loading" :error="error">
      <div class="stats">
        <Stat label="Total" :value="t(data?.totals.totalTco2e ?? 0)" unit="t CO₂e" />
        <Stat label="Scope 1" :value="t(data?.totals.scope1Tco2e ?? 0)" unit="t CO₂e" tone="oxide" />
        <Stat label="Scope 2" :value="t(data?.totals.scope2Tco2e ?? 0)" unit="t CO₂e" tone="slate" />
        <Stat
          label="Months reported"
          :value="String(data?.months.length ?? 0)"
          :note="data?.monthsWithoutFuelData.length ? `${data.monthsWithoutFuelData.length} without fuel data` : 'complete'"
        />
      </div>
    </Panel>

    <TraceLink
      to="/emissions/calculation"
      cta="See how this value was calculated"
      lede="Every figure above, unrolled to the source rows it was summed from, and reconciled."
    />

    <Panel
      v-for="c in charts"
      :key="c.focus"
      :title="c.title"
      :note="c.note"
      :loading="loading"
      :error="error"
    >
      <MonthlyChart v-if="data" :months="data.months" :focus="c.focus" />
      <p v-if="c.focus === 'scope2'" class="axis-note">
        All three charts share one scale, so a bar means the same height on each.
      </p>
    </Panel>

    <Panel title="Impact of data correction" :loading="loading" :error="error">
      <div v-if="correction" class="correction">
<!-- Event, then what was done, then what it was worth. The meter ID and the
             unit are provenance, so they sit inside the sentence rather than open it. -->
        <p>
          From October 2025, one electricity meter (MTR-07) started reporting in the wrong unit.
          It was recording megawatt-hours but still labelled kWh, and it had not recovered by the
          last available reading. We corrected it. Without that correction, Scope 2 would be
          understated by <b>{{ t(correction.differenceTco2e) }} t CO₂e</b> across the period.
        </p>
        <table class="num mono">
          <tbody>
            <tr>
              <td>As reported</td>
              <td>{{ t(correction.scope2AsReportedTco2e) }} t CO₂e</td>
            </tr>
            <tr>
              <td>Corrected</td>
              <td>{{ t(correction.scope2CorrectedTco2e) }} t CO₂e</td>
            </tr>
            <tr class="delta">
              <td>Difference</td>
              <td>+{{ t(correction.differenceTco2e) }} t CO₂e</td>
            </tr>
          </tbody>
        </table>
        <p class="aside">
          We keep both values on every reading, so the difference stays visible.
        </p>
      </div>
    </Panel>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 30px; }

.head { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; flex-wrap: wrap; }
h1 { margin: 0 0 8px; font-size: 33px; font-weight: 800; }
.lede { margin: 0; max-width: 60ch; color: var(--ink-soft); font-size: 15.5px; }

.toggle { display: flex; flex-direction: column; gap: 6px; align-items: flex-end; }
.toggle div { display: flex; gap: 6px; }

.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 24px; }

.axis-note { margin: 10px 0 0; font-size: 11.5px; color: var(--ink-faint); }

.correction { display: flex; flex-direction: column; gap: 14px; }
.correction p { margin: 0; max-width: 72ch; color: var(--ink-soft); }
.correction b { color: var(--ink); }

table { border-collapse: collapse; font-size: 14px; }
td { padding: 6px 24px 6px 0; border-bottom: 1px solid var(--rule); }
td:last-child { text-align: right; padding-right: 0; min-width: 130px; }
.delta td { font-weight: 700; color: var(--oxide); border-bottom: none; }

.aside { font-size: 13.5px; color: var(--ink-faint); }
</style>
