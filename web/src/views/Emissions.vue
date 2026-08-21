<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Basis, MonthlyEmissions } from '@contracts';
import { api } from '../api';
import Panel from '../components/Panel.vue';
import Stat from '../components/Stat.vue';
import MonthlyChart from '../components/MonthlyChart.vue';

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

    <Panel :loading="loading" :error="error">
      <div class="stats">
        <Stat label="Total" :value="t(data?.totals.totalTco2e ?? 0)" unit="t CO₂e" />
        <Stat label="Scope 1" :value="t(data?.totals.scope1Tco2e ?? 0)" unit="t" tone="oxide" />
        <Stat label="Scope 2" :value="t(data?.totals.scope2Tco2e ?? 0)" unit="t" tone="slate" />
        <Stat
          label="Months reported"
          :value="String(data?.months.length ?? 0)"
          :note="data?.monthsWithoutFuelData.length ? `${data.monthsWithoutFuelData.length} without fuel data` : 'complete'"
        />
      </div>
    </Panel>

    <Panel title="Monthly, by scope" :loading="loading" :error="error">
      <MonthlyChart v-if="data" :months="data.months" />
    </Panel>

    <Panel title="What the correction is worth" :loading="loading" :error="error">
      <div v-if="correction" class="correction">
        <p>
          Meter MTR-07 began reporting in megawatt-hours from October 2025 while still labelled kWh,
          and had not recovered by the last available reading. Left alone, Scope 2 would be
          understated by
          <b>{{ t(correction.differenceTco2e) }} t CO₂e</b> across the period.
        </p>
        <table class="num mono">
          <tbody>
            <tr>
              <td>As reported</td>
              <td>{{ t(correction.scope2AsReportedTco2e) }} t</td>
            </tr>
            <tr>
              <td>Corrected</td>
              <td>{{ t(correction.scope2CorrectedTco2e) }} t</td>
            </tr>
            <tr class="delta">
              <td>Difference</td>
              <td>+{{ t(correction.differenceTco2e) }} t</td>
            </tr>
          </tbody>
        </table>
        <p class="aside">
          Both figures are stored on every reading, which is why this page can serve either basis
          rather than asking you to trust the corrected one.
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

.correction { display: flex; flex-direction: column; gap: 14px; }
.correction p { margin: 0; max-width: 72ch; color: var(--ink-soft); }
.correction b { color: var(--ink); }

table { border-collapse: collapse; font-size: 14px; }
td { padding: 6px 24px 6px 0; border-bottom: 1px solid var(--rule); }
td:last-child { text-align: right; padding-right: 0; min-width: 110px; }
.delta td { font-weight: 700; color: var(--oxide); border-bottom: none; }

.aside { font-size: 13.5px; color: var(--ink-faint); }
</style>
