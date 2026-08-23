<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import type { Evidence } from '@contracts';
import { api } from '../api';
import { useAsync } from '../composables/useAsync';
import Panel from '../components/Panel.vue';
import DonutChart, { type Segment } from '../components/DonutChart.vue';
import RingMeter from '../components/RingMeter.vue';
import SubTabs from '../components/SubTabs.vue';

const tabs = [
  { to: '/data-trust', label: 'Ledger' },
  { to: '/data-trust/suppliers', label: 'How records were matched' },
];

const quality = useAsync(() => api.dataQuality());

const files = computed(() => quality.data.value?.files ?? []);
const rowsRead = computed(() => files.value.reduce((a, f) => a + f.rowsRead, 0));
const rowsPromoted = computed(() => files.value.reduce((a, f) => a + f.rowsPromoted, 0));
const rowsRejected = computed(() => files.value.reduce((a, f) => a + f.rowsRejected, 0));

// Disposition, not category: three states a row can end up in, so the colours
// are the reserved status ones rather than a series ramp.
const byAction = computed<Segment[]>(() => {
  const t = quality.data.value?.totals;
  if (!t) return [];
  return [
    { label: 'Corrected automatically', value: t.fixed, color: 'var(--act-fixed)' },
    { label: 'Flagged for review', value: t.flagged, color: 'var(--act-flagged)' },
    { label: 'Rejected', value: t.rejected, color: 'var(--act-rejected)' },
  ].filter((s) => s.value > 0);
});

// What each file is for. Row counts alone do not tell a reader why the file
// matters, and the answer is not derivable from the data.
const PURPOSE: Record<string, string> = {
  'fuel_deliveries.csv': 'Scope 1 emissions',
  'electricity_meter_readings.csv': 'Scope 2 emissions',
  'incident_register.csv': 'Safety analysis',
  'suppliers.csv': 'Supplier attribution',
};

const dataset = ref<string>('all');
const datasets = computed(() => [
  'all',
  ...new Set((quality.data.value?.byRule ?? []).map((r) => r.dataset)),
]);

const rules = computed(() =>
  (quality.data.value?.byRule ?? []).filter(
    (r) => dataset.value === 'all' || r.dataset === dataset.value,
  ),
);

// Drill-down. One click from a finding to the CSV line that caused it.
const evidence = ref<Evidence | null>(null);
const evidenceError = ref<string | null>(null);
const openRule = ref<string | null>(null);

// One rule open at a time, its evidence inline underneath. A rule that explains
// itself in the abstract is a claim; the row it fired on is the proof.
async function toggle(ruleCode: string) {
  if (openRule.value === ruleCode) {
    openRule.value = null;
    return;
  }
  openRule.value = ruleCode;
  evidence.value = null;
  evidenceError.value = null;

  const rowId = firstRowFor(ruleCode);
  if (rowId === null) return;
  try {
    const found = await api.evidence(rowId);
    if (openRule.value === ruleCode) evidence.value = found;
  } catch (e) {
    if (openRule.value === ruleCode) {
      evidenceError.value = e instanceof Error ? e.message : String(e);
    }
  }
}

function firstRowFor(ruleCode: string): number | null {
  return quality.data.value?.findings.find((f) => f.ruleCode === ruleCode && f.sourceRowId)
    ?.sourceRowId ?? null;
}
</script>

<template>
  <div class="page">
    <div class="head">
      <h1 class="sans">Data trust</h1>
      <p class="lede">
        Every source row is accounted for. Below is what was found in the four files, what was
        done about each problem, and why. Nothing was discarded, and the counts are enforced by a
        database constraint rather than by convention.
      </p>
    </div>

    <SubTabs :tabs="tabs" />

    <div class="rings">
      <Panel
        title="Source rows accounted for"
        note="every row, tracked"
        :loading="quality.loading.value"
        :error="quality.error.value"
      >
        <!-- Not "100% promoted": with 341 findings on the page that reads as
             "the data was fine". Accounted for is the claim being made. -->
        <RingMeter
          :value="rowsPromoted"
          :of="rowsRead"
          :centre="`${rowsPromoted} / ${rowsRead}`"
          caption="source rows"
          note="A database constraint enforces this, so no row can go missing unrecorded."
        >
          <ul class="tally">
            <li><span>read from source</span><b class="mono num">{{ rowsRead }}</b></li>
            <li><span>promoted</span><b class="mono num">{{ rowsPromoted }}</b></li>
            <li><span>rejected</span><b class="mono num">{{ rowsRejected }}</b></li>
          </ul>
        </RingMeter>
      </Panel>

      <Panel
        title="Data quality findings"
        :note="`${quality.data.value?.totals.findings ?? 0} in total`"
        :loading="quality.loading.value"
        :error="quality.error.value"
      >
        <DonutChart
          :segments="byAction"
          :centre-value="String(quality.data.value?.totals.findings ?? 0)"
          centre-caption="findings"
        />
      </Panel>
    </div>

    <Panel title="What was read" :loading="quality.loading.value" :error="quality.error.value">
      <div class="files">
        <div v-for="f in quality.data.value?.files ?? []" :key="f.fileName" class="file">
          <div class="fname">
            <span class="mono">{{ f.fileName }}</span>
            <span class="purpose">{{ PURPOSE[f.fileName] ?? 'reference data' }}</span>
          </div>
          <div class="counts mono num">
            <span><b>{{ f.rowsRead }}</b> read</span>
            <span><b>{{ f.rowsPromoted }}</b> promoted</span>
            <span :class="{ warn: f.rowsFlagged }"><b>{{ f.rowsFlagged }}</b> flagged</span>
            <span :class="{ bad: f.rowsRejected }"><b>{{ f.rowsRejected }}</b> rejected</span>
          </div>
        </div>
      </div>
      <p class="balance mono">
        read = promoted + rejected on every file
      </p>
    </Panel>

    <Panel
      title="Rules"
      :note="`${quality.data.value?.totals.fixed ?? 0} fixed · ${quality.data.value?.totals.flagged ?? 0} flagged · ${quality.data.value?.totals.rejected ?? 0} rejected`"
      :loading="quality.loading.value"
      :error="quality.error.value"
    >
      <div class="filters">
        <button
          v-for="d in datasets"
          :key="d"
          :aria-pressed="dataset === d"
          @click="dataset = d"
        >
          {{ d === 'all' ? 'All datasets' : d }}
        </button>
      </div>

      <ul class="rules">
        <li v-for="r in rules" :key="r.ruleCode" :class="{ open: openRule === r.ruleCode }">
          <button
            class="rhead"
            :aria-expanded="openRule === r.ruleCode"
            :disabled="!firstRowFor(r.ruleCode)"
            @click="toggle(r.ruleCode)"
          >
            <span class="code mono">{{ r.ruleCode }}</span>
            <span class="act" :class="r.action">{{ r.action }}</span>
            <span class="count mono num">{{ r.count }}</span>
            <span v-if="firstRowFor(r.ruleCode)" class="chev" aria-hidden="true">
              {{ openRule === r.ruleCode ? '−' : '+' }}
            </span>
          </button>
          <p class="msg">{{ r.message }}</p>
          <p class="why">{{ r.rationale }}</p>

          <div v-if="openRule === r.ruleCode" class="drill">
            <p v-if="evidenceError" class="err">{{ evidenceError }}</p>
            <p v-else-if="!evidence" class="loading">Loading the row…</p>
            <template v-else>
              <div class="eyebrow">
                {{ evidence.fileName }} · row {{ evidence.rowNumber }} · {{ evidence.disposition }}
              </div>

              <table class="raw mono">
                <tbody>
                  <tr v-for="(v, k) in evidence.raw" :key="k">
                    <td class="k">{{ k }}</td>
                    <td>{{ v }}</td>
                  </tr>
                </tbody>
              </table>

              <div v-for="f in evidence.findings" :key="f.id" class="f">
                <div class="fh">
                  <span class="code mono">{{ f.ruleCode }}</span>
                  <span class="act" :class="f.action">{{ f.action }}</span>
                  <span v-if="f.correctedValue" class="change mono">
                    {{ f.originalValue }} → {{ f.correctedValue }}
                  </span>
                </div>
                <p class="why">{{ f.rationale }}</p>
              </div>
            </template>
          </div>
        </li>
      </ul>
    </Panel>

    <Panel title="Report" note="pdf">
      <div class="export">
        <div>
          <p class="lede-sm">
            Everything on this page, plus the emissions tables and the safety findings, typeset as
            a dated report. It is built from the same endpoints the dashboard reads, so the two
            cannot disagree.
          </p>
          <ul class="contents">
            <li>Summary and the value of each correction</li>
            <li>Emissions by month, by scope, with the record count behind every row</li>
            <li>Psychosocial and severity findings, each with its quoted source</li>
            <li>Per-file row counters and the full rule catalogue</li>
            <li>Method and provenance</li>
          </ul>
        </div>
        <RouterLink to="/report" class="cta sans">Generate report →</RouterLink>
      </div>
    </Panel>

  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 30px; }
.export { display: flex; align-items: center; justify-content: space-between; gap: 30px; flex-wrap: wrap; }
.lede-sm { margin: 0 0 10px; color: var(--ink-soft); max-width: 62ch; font-size: 14.5px; }
.contents { margin: 0; padding-left: 18px; color: var(--ink-faint); font-size: 13px; }
.contents li { padding: 1px 0; }
.cta {
  flex: 0 0 auto;
  text-decoration: none;
  font-weight: 600;
  font-size: 14px;
  color: #fff;
  padding: 10px 20px;
  border-radius: 999px;
  background: linear-gradient(180deg, var(--ramp-4), var(--ramp-3));
  box-shadow: 0 3px 10px -2px rgba(37, 106, 191, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.3);
}

.tally { list-style: none; margin: 0; padding: 0; }
.tally li {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  padding: 5px 0;
  font-size: 13.5px;
  color: var(--ink-soft);
}
.tally b { font-size: 12.5px; font-weight: 500; color: var(--ink); }

.rings { display: grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap: 30px; }
.head { display: flex; flex-direction: column; gap: 8px; }
h1 { margin: 0; font-size: 33px; font-weight: 800; }
.lede { margin: 0; max-width: 62ch; color: var(--ink-soft); font-size: 15.5px; }

.files { display: flex; flex-direction: column; }
.file {
  display: grid;
  grid-template-columns: minmax(210px, 1fr) auto;
  gap: 20px;
  align-items: center;
  padding: 11px 0;
  border-top: 1px solid var(--rule);
}
.file:first-child { border-top: none; padding-top: 0; }
.fname { display: flex; flex-direction: column; gap: 2px; }
.fname .mono { font-size: 13px; }
.purpose { font-size: 11.5px; color: var(--ink-faint); }
.counts { display: flex; gap: 18px; font-size: 12px; color: var(--ink-faint); }
.counts b { color: var(--ink); font-weight: 500; }
.counts .warn b { color: var(--amber); }
.counts .bad b { color: var(--critical); }
.balance { font-size: 11px; color: var(--ink-faint); margin: 14px 0 0; padding-top: 12px; border-top: 1px solid var(--rule); }

.filters { display: flex; gap: 6px; margin-bottom: 18px; flex-wrap: wrap; }

.rules { list-style: none; margin: 0; padding: 0; }
.rules li { padding: 15px 0; border-top: 1px solid var(--rule); display: flex; flex-direction: column; gap: 5px; }
.rules li:first-child { border-top: none; padding-top: 0; }

.rhead {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  background: none;
  border: none;
  box-shadow: none;
  padding: 0;
  border-radius: 0;
  text-align: left;
}
.rhead:not(:disabled) { cursor: pointer; }
.rhead:disabled { cursor: default; }
.rhead:hover:not(:disabled) .code { color: var(--ramp-2); }
.chev { font-size: 15px; color: var(--ink-faint); line-height: 1; width: 12px; text-align: center; }

.drill {
  margin-top: 12px;
  padding: 14px 16px;
  border-radius: 12px;
  background: var(--paper);
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.code { font-size: 12px; font-weight: 500; color: var(--ink); }
.count { font-size: 12px; color: var(--ink-faint); margin-left: auto; }
.rules li.open { padding-bottom: 20px; }

.act {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 2px;
}
/* Colour plus a glyph. Roughly one man in twelve cannot separate these by hue,
   so the mark has to say it too. */
.act.fixed { background: color-mix(in srgb, var(--act-fixed) 13%, transparent); color: var(--act-fixed); }
.act.flagged { background: color-mix(in srgb, var(--act-flagged) 22%, transparent); color: var(--act-flagged-ink); }
.act.rejected { background: color-mix(in srgb, var(--act-rejected) 14%, transparent); color: var(--act-rejected); }
.act::before { margin-right: 4px; font-weight: 700; }
.act.fixed::before { content: '✓'; }
.act.flagged::before { content: '!'; }
.act.rejected::before { content: '✕'; }

.inspect { font-size: 12px; padding: 3px 9px; }
.msg { margin: 0; font-size: 14.5px; }
.why { margin: 0; font-size: 13.5px; color: var(--ink-faint); max-width: 84ch; }

.evidence { display: flex; flex-direction: column; gap: 16px; }
.raw { border-collapse: collapse; font-size: 12.5px; background: var(--paper); width: 100%; }
.raw td { padding: 6px 12px; border-bottom: 1px solid var(--rule); }
.raw .k { color: var(--ink-faint); width: 150px; }

.found { display: flex; flex-direction: column; gap: 12px; }
.f { display: flex; flex-direction: column; gap: 4px; }
.fh { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.change { font-size: 11.5px; color: var(--ink-soft); }
.err { color: var(--critical); }
.loading { color: var(--ink-faint); }
</style>
