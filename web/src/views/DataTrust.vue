<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import type { Evidence } from '@contracts';
import { api } from '../api';
import { useAsync } from '../composables/useAsync';
import Panel from '../components/Panel.vue';
import DonutChart, { type Segment } from '../components/DonutChart.vue';
import RingMeter from '../components/RingMeter.vue';

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
    { label: 'fixed', value: t.fixed, color: 'var(--ramp-3)' },
    { label: 'flagged', value: t.flagged, color: 'var(--mark-warning)' },
    { label: 'rejected', value: t.rejected, color: 'var(--mark-critical)' },
  ].filter((s) => s.value > 0);
});

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
const openRow = ref<number | null>(null);

async function inspect(sourceRowId: number) {
  openRow.value = sourceRowId;
  evidence.value = null;
  evidenceError.value = null;
  try {
    evidence.value = await api.evidence(sourceRowId);
  } catch (e) {
    evidenceError.value = e instanceof Error ? e.message : String(e);
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
        Every problem found in the source files, what was done about it, and why. Nothing was
        discarded: the row counts below are enforced by a database constraint, not by convention.
      </p>
    </div>

    <div class="rings">
      <Panel title="Rows kept" note="read to promoted" :loading="quality.loading.value" :error="quality.error.value">
        <RingMeter
          :value="rowsPromoted"
          :of="rowsRead"
          caption="promoted"
          note="A database constraint enforces read = promoted + rejected."
        >
          <ul class="tally">
            <li><span>rows read</span><b class="mono num">{{ rowsRead }}</b></li>
            <li><span>promoted</span><b class="mono num">{{ rowsPromoted }}</b></li>
            <li><span>rejected</span><b class="mono num">{{ rowsRejected }}</b></li>
          </ul>
        </RingMeter>
      </Panel>

      <Panel
        title="What was done about it"
        :note="`${quality.data.value?.totals.findings ?? 0} findings`"
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
          <div class="fname mono">{{ f.fileName }}</div>
          <div class="counts mono num">
            <span><b>{{ f.rowsRead }}</b> read</span>
            <span><b>{{ f.rowsPromoted }}</b> promoted</span>
            <span :class="{ warn: f.rowsFlagged }"><b>{{ f.rowsFlagged }}</b> flagged</span>
            <span :class="{ bad: f.rowsRejected }"><b>{{ f.rowsRejected }}</b> rejected</span>
          </div>
          <div class="hash mono" :title="f.contentHash">sha256 {{ f.contentHash.slice(0, 12) }}…</div>
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
        <li v-for="r in rules" :key="r.ruleCode">
          <div class="rhead">
            <span class="code mono">{{ r.ruleCode }}</span>
            <span class="act" :class="r.action">{{ r.action }}</span>
            <span class="count mono num">{{ r.count }}</span>
            <button
              v-if="firstRowFor(r.ruleCode)"
              class="inspect"
              @click="inspect(firstRowFor(r.ruleCode)!)"
            >
              View a row
            </button>
          </div>
          <p class="msg">{{ r.message }}</p>
          <p class="why">{{ r.rationale }}</p>
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
            <li>Per-file row counters, content hashes, and the full rule catalogue</li>
            <li>Method and provenance</li>
          </ul>
        </div>
        <RouterLink to="/report" class="cta sans">Open report →</RouterLink>
      </div>
    </Panel>

    <Panel v-if="openRow !== null" title="Evidence" :note="`source row ${openRow}`">
      <p v-if="evidenceError" class="err">{{ evidenceError }}</p>
      <p v-else-if="!evidence" class="loading">Loading…</p>
      <div v-else class="evidence">
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

        <div class="found">
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
        </div>
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
  grid-template-columns: minmax(210px, 1fr) auto auto;
  gap: 20px;
  align-items: center;
  padding: 11px 0;
  border-top: 1px solid var(--rule);
}
.file:first-child { border-top: none; padding-top: 0; }
.fname { font-size: 13px; }
.counts { display: flex; gap: 18px; font-size: 12px; color: var(--ink-faint); }
.counts b { color: var(--ink); font-weight: 500; }
.counts .warn b { color: var(--amber); }
.counts .bad b { color: var(--critical); }
.hash { font-size: 10.5px; color: var(--ink-faint); }
.balance { font-size: 11px; color: var(--ink-faint); margin: 14px 0 0; padding-top: 12px; border-top: 1px solid var(--rule); }

.filters { display: flex; gap: 6px; margin-bottom: 18px; flex-wrap: wrap; }

.rules { list-style: none; margin: 0; padding: 0; }
.rules li { padding: 15px 0; border-top: 1px solid var(--rule); display: flex; flex-direction: column; gap: 5px; }
.rules li:first-child { border-top: none; padding-top: 0; }

.rhead { display: flex; align-items: center; gap: 12px; }
.code { font-size: 12px; font-weight: 500; color: var(--ink); }
.count { font-size: 12px; color: var(--ink-faint); margin-left: auto; }

.act {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 2px;
}
.act.fixed { background: color-mix(in srgb, var(--ramp-3) 14%, transparent); color: var(--ramp-2); }
.act.flagged { background: color-mix(in srgb, var(--amber) 20%, transparent); color: var(--amber); }
.act.rejected { background: color-mix(in srgb, var(--critical) 15%, transparent); color: var(--critical); }

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
