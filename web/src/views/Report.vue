<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { api } from '../api';
import { useAsync } from '../composables/useAsync';

// The report is a route, not a generated file. Everything on it comes from the
// same endpoints the dashboard reads, through the same contracts, so a figure
// here cannot drift from the figure on screen. The PDF is whatever the browser
// prints, which is why the page carries its own paper styles.
const emissions = useAsync(() => api.emissions('corrected'));
const incidents = useAsync(() => api.incidentSummary());
const quality = useAsync(() => api.dataQuality());
const ai = useAsync(() => api.aiFindings());

const loading = computed(
  () =>
    emissions.loading.value || incidents.loading.value || quality.loading.value || ai.loading.value,
);
const error = computed(
  () => emissions.error.value ?? incidents.error.value ?? quality.error.value ?? ai.error.value,
);

const generatedAt = ref(
  new Date().toLocaleString('en-AU', { dateStyle: 'long', timeStyle: 'short' }),
);

const t = (n: number) => n.toLocaleString('en-AU', { maximumFractionDigits: 0 });

const psychosocial = computed(() => (ai.data.value?.findings ?? []).filter((f) => f.isPsychosocial));
const severityConcerns = computed(() =>
  (ai.data.value?.findings ?? []).filter((f) => f.severityInconsistent),
);

const flaggedRules = computed(() =>
  (quality.data.value?.byRule ?? []).filter((r) => r.action !== 'fixed'),
);
const fixedRules = computed(() => (quality.data.value?.byRule ?? []).filter((r) => r.action === 'fixed'));

const rowsRead = computed(() =>
  (quality.data.value?.files ?? []).reduce((a, f) => a + f.rowsRead, 0),
);

function printReport() {
  window.print();
}
</script>

<template>
  <div class="report" :class="{ ready: !loading && !error }">
    <!-- Screen-only chrome. The print rules below drop all of it. -->
    <div class="toolbar no-print">
      <RouterLink to="/data-trust" class="back">← Back to Data Trust</RouterLink>
      <div class="actions">
        <span class="hint">Choose “Save as PDF” as the destination</span>
        <button class="primary" :disabled="loading || !!error" @click="printReport">
          Save as PDF
        </button>
      </div>
    </div>

    <p v-if="loading" class="state">Assembling the report…</p>
    <p v-else-if="error" class="state err">{{ error }}</p>

    <article v-else class="sheet">
      <header class="masthead">
        <div>
          <div class="org">Ironbark Ridge Resources</div>
          <h1>Emissions, Safety and Data Quality Report</h1>
          <div class="sub">Open-cut coal mine and processing operation, Queensland</div>
        </div>
        <dl class="meta">
          <div><dt>Reporting period</dt><dd>Jan 2025 – Jun 2026</dd></div>
          <div><dt>Basis</dt><dd>Corrected</dd></div>
          <div><dt>Generated</dt><dd>{{ generatedAt }}</dd></div>
        </dl>
      </header>

      <section>
        <h2>1 &nbsp;Summary</h2>
        <table class="figures">
          <tbody>
            <tr>
              <td>Total emissions</td>
              <td class="n">{{ t(emissions.data.value?.totals.totalTco2e ?? 0) }} t CO₂e</td>
            </tr>
            <tr>
              <td>Scope 1 — diesel and fuel deliveries</td>
              <td class="n">{{ t(emissions.data.value?.totals.scope1Tco2e ?? 0) }} t</td>
            </tr>
            <tr>
              <td>Scope 2 — purchased electricity</td>
              <td class="n">{{ t(emissions.data.value?.totals.scope2Tco2e ?? 0) }} t</td>
            </tr>
            <tr>
              <td>Safety incidents recorded</td>
              <td class="n">{{ incidents.data.value?.total ?? 0 }}</td>
            </tr>
            <tr>
              <td>Source rows read</td>
              <td class="n">{{ rowsRead }}</td>
            </tr>
            <tr>
              <td>Source rows discarded</td>
              <td class="n">{{ quality.data.value?.totals.rejected ?? 0 }}</td>
            </tr>
          </tbody>
        </table>

        <p class="callout">
          Scope 2 is reported <b>{{ t(emissions.data.value?.correction.differenceTco2e ?? 0) }} t
          CO₂e higher</b> than the source files state. Meter MTR-07 began reporting in
          megawatt-hours from October 2025 while still labelled kWh and had not recovered by the
          last available reading. Both the as-reported and corrected values are stored against every
          reading; §4 sets out the rule that made the change.
        </p>
      </section>

      <section>
        <h2>2 &nbsp;Emissions by month</h2>
        <table class="grid num">
          <thead>
            <tr>
              <th>Month</th>
              <th class="n">Scope 1 (t)</th>
              <th class="n">Scope 2 (t)</th>
              <th class="n">Total (t)</th>
              <th>Basis of record</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in emissions.data.value?.months ?? []" :key="m.month">
              <td class="mono">{{ m.month }}</td>
              <td class="n">{{ m.hasFuelData ? t(m.scope1Tco2e) : '—' }}</td>
              <td class="n">{{ t(m.scope2Tco2e) }}</td>
              <td class="n">{{ t(m.totalTco2e) }}</td>
              <td class="src">
                {{ m.fuelDeliveries }} deliveries, {{ m.meterReadings }} meter readings
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td class="n">{{ t(emissions.data.value?.totals.scope1Tco2e ?? 0) }}</td>
              <td class="n">{{ t(emissions.data.value?.totals.scope2Tco2e ?? 0) }}</td>
              <td class="n">{{ t(emissions.data.value?.totals.totalTco2e ?? 0) }}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
        <p v-if="emissions.data.value?.monthsWithoutFuelData.length" class="note">
          No fuel delivery records exist for
          {{ emissions.data.value.monthsWithoutFuelData.join(', ') }}. Scope 1 there is reported as
          unknown rather than as zero: the month's total is its Scope 2 alone, and no estimate has
          been substituted for the missing fuel.
        </p>
      </section>

      <section class="break">
        <h2>3 &nbsp;Safety</h2>
        <p>
          {{ incidents.data.value?.total ?? 0 }} incidents were recorded across the period.
          {{ incidents.data.value?.unresolvedSeverity ?? 0 }} carries a severity that could not be
          resolved to a number and has been left unset rather than assumed.
        </p>

        <h3>3.1 &nbsp;Psychosocial hazards</h3>
        <p>
          {{ psychosocial.length }} incidents describe a hazard recognised by Queensland's
          <i>Managing the risk of psychosocial hazards at work Code of Practice 2022</i>. None is
          coded as such in the register, which has no psychosocial type code — they are therefore
          invisible to any count by type.
        </p>
        <ol class="findings">
          <li v-for="f in psychosocial" :key="f.incidentId">
            <div class="fhead mono">
              {{ f.sourceIncidentId }} · {{ f.incidentDate }} · coded {{ f.typeCode ?? '—' }} ·
              severity {{ f.recordedSeverity ?? 'unresolved' }}
            </div>
            <p class="desc">{{ f.description }}</p>
            <p class="quote">“{{ f.categoryEvidenceQuote }}”</p>
            <p class="reason">{{ f.categoryReasoning }}</p>
          </li>
        </ol>

        <h3>3.2 &nbsp;Severity inconsistencies</h3>
        <p>
          {{ severityConcerns.length }} incidents record a severity below what the description
          states. Each was recorded at severity 1.
        </p>
        <ol class="findings">
          <li v-for="f in severityConcerns" :key="f.incidentId">
            <div class="fhead mono">
              {{ f.sourceIncidentId }} · {{ f.incidentDate }} · recorded
              {{ f.recordedSeverity ?? 'unresolved' }} · suggested {{ f.suggestedSeverity ?? '—' }}
            </div>
            <p class="desc">{{ f.description }}</p>
            <p class="quote">“{{ f.severityEvidenceQuote }}”</p>
            <p class="reason">{{ f.severityReasoning }}</p>
          </li>
        </ol>
      </section>

      <section class="break">
        <h2>4 &nbsp;Data quality</h2>
        <p>
          Nothing in the source files was discarded. Every row read was either promoted into the
          reporting tables or rejected with a reason, and a database constraint enforces that the
          two account for the total.
        </p>

        <table class="grid">
          <thead>
            <tr>
              <th>Source file</th>
              <th class="n">Read</th>
              <th class="n">Promoted</th>
              <th class="n">Flagged</th>
              <th class="n">Rejected</th>
              <th>SHA-256</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="f in quality.data.value?.files ?? []" :key="f.fileName">
              <td class="mono">{{ f.fileName }}</td>
              <td class="n">{{ f.rowsRead }}</td>
              <td class="n">{{ f.rowsPromoted }}</td>
              <td class="n">{{ f.rowsFlagged }}</td>
              <td class="n">{{ f.rowsRejected }}</td>
              <td class="mono hash">{{ f.contentHash.slice(0, 16) }}…</td>
            </tr>
          </tbody>
        </table>

        <h3>4.1 &nbsp;Corrections applied</h3>
        <table class="grid">
          <thead>
            <tr><th>Rule</th><th class="n">Rows</th><th>What was changed, and why</th></tr>
          </thead>
          <tbody>
            <tr v-for="r in fixedRules" :key="r.ruleCode">
              <td class="mono">{{ r.ruleCode }}</td>
              <td class="n">{{ r.count }}</td>
              <td><b>{{ r.message }}</b> {{ r.rationale }}</td>
            </tr>
          </tbody>
        </table>

        <h3>4.2 &nbsp;Recorded without correction</h3>
        <p>
          These were loaded as they arrived and flagged. Each is a question for the site rather than
          a change we are entitled to make.
        </p>
        <table class="grid">
          <thead>
            <tr><th>Rule</th><th class="n">Rows</th><th>Concern</th></tr>
          </thead>
          <tbody>
            <tr v-for="r in flaggedRules" :key="r.ruleCode">
              <td class="mono">{{ r.ruleCode }}</td>
              <td class="n">{{ r.count }}</td>
              <td><b>{{ r.message }}</b> {{ r.rationale }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="break">
        <h2>5 &nbsp;Method and provenance</h2>
        <dl class="method">
          <div>
            <dt>Emission factors</dt>
            <dd>
              Resolved at load time and stored against each delivery and reading, so a later change
              to the factor table cannot silently restate a past period.
            </dd>
          </div>
          <div>
            <dt>Classification</dt>
            <dd>
              {{ ai.data.value?.model ?? '—' }}, prompt {{ ai.data.value?.promptVersion ?? '—' }},
              run offline over {{ ai.data.value?.totals.classified ?? 0 }} incidents. No model is
              called when this report is opened.
            </dd>
          </div>
          <div>
            <dt>Grounding</dt>
            <dd>
              Every quoted passage in §3 was checked as an exact substring of the incident
              description it is attributed to. A quote that failed that check discarded the finding
              it supported rather than being reported unverified.
            </dd>
          </div>
          <div>
            <dt>Traceability</dt>
            <dd>
              Each of the {{ quality.data.value?.totals.findings ?? 0 }} findings in §4 points at the
              source row that raised it, and each row is retained verbatim as it was read.
            </dd>
          </div>
        </dl>

        <p class="colophon">
          Generated from the Ironbark Ridge reporting database on {{ generatedAt }}. Figures are
          computed at request time; two reports generated from the same database will agree.
        </p>
      </section>
    </article>
  </div>
</template>

<style scoped>
.report { max-width: 860px; margin: 0 auto; }

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  flex-wrap: wrap;
  margin-bottom: 22px;
}
.back { font-size: 13.5px; color: var(--ink-soft); text-decoration: none; font-weight: 600; }
.back:hover { color: var(--ramp-2); }
.actions { display: flex; align-items: center; gap: 14px; }
.hint { font-size: 12px; color: var(--ink-faint); }
button.primary {
  background: linear-gradient(180deg, var(--ramp-4), var(--ramp-3));
  border-color: transparent;
  color: #fff;
  font-weight: 600;
  padding: 8px 18px;
  box-shadow: 0 3px 10px -2px rgba(37, 106, 191, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.3);
}
button.primary:disabled { opacity: 0.5; cursor: default; }

.state { color: var(--ink-faint); }
.err { color: var(--critical); }

/* Paper, on screen as well as on paper: white, opaque, and sized to the column
   a page will actually give it. */
.sheet {
  background: #fff;
  border: 1px solid var(--rule);
  border-radius: 14px;
  box-shadow: var(--lift);
  padding: 54px 58px 64px;
  color: #111;
  font-size: 13px;
  line-height: 1.62;
}

.masthead {
  display: flex;
  justify-content: space-between;
  gap: 32px;
  align-items: flex-start;
  padding-bottom: 20px;
  border-bottom: 2px solid #111;
  margin-bottom: 30px;
}
.org {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: #555;
}
h1 { margin: 6px 0 4px; font-size: 23px; font-weight: 800; letter-spacing: -0.025em; }
.sub { font-size: 12.5px; color: #555; }

.meta { margin: 0; font-size: 11px; min-width: 210px; }
.meta div { display: flex; justify-content: space-between; gap: 14px; padding: 2px 0; }
.meta dt { color: #666; }
.meta dd { margin: 0; font-weight: 600; font-family: 'JetBrains Mono', monospace; font-size: 10.5px; }

section { margin-bottom: 32px; }
h2 {
  font-size: 14.5px;
  font-weight: 800;
  margin: 0 0 12px;
  padding-bottom: 6px;
  border-bottom: 1px solid #ddd;
}
h3 { font-size: 12.5px; font-weight: 700; margin: 22px 0 8px; }
section p { margin: 0 0 10px; max-width: 74ch; }

.figures { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
.figures td { padding: 7px 0; border-bottom: 1px solid #eee; }
.figures td.n { text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; }

.callout {
  background: #f4f8fd;
  border-left: 3px solid var(--ramp-3);
  padding: 12px 16px;
  font-size: 12.5px;
}

.grid { width: 100%; border-collapse: collapse; font-size: 11.5px; margin-bottom: 8px; }
.grid th {
  text-align: left;
  font-weight: 700;
  padding: 6px 10px 6px 0;
  border-bottom: 1.5px solid #111;
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.grid td { padding: 6px 10px 6px 0; border-bottom: 1px solid #eee; vertical-align: top; }
.grid tfoot td { font-weight: 800; border-top: 1.5px solid #111; border-bottom: none; }
.grid .n, .grid th.n { text-align: right; font-variant-numeric: tabular-nums; padding-right: 14px; }
.grid .src { color: #666; font-size: 10.5px; }
.hash { color: #777; font-size: 9.5px; }

.findings { margin: 0; padding-left: 18px; }
.findings li { margin-bottom: 15px; break-inside: avoid; }
.fhead { font-size: 10px; color: #555; letter-spacing: 0.02em; }
.desc { margin: 3px 0 6px !important; }
.quote {
  margin: 0 0 5px !important;
  padding-left: 12px;
  border-left: 2px solid var(--ramp-4);
  font-style: italic;
  color: #333;
}
.reason { margin: 0 !important; font-size: 12px; color: #555; }

.method { margin: 0; }
.method div { display: grid; grid-template-columns: 130px 1fr; gap: 16px; padding: 7px 0; border-bottom: 1px solid #eee; }
.method dt { font-weight: 700; font-size: 11.5px; }
.method dd { margin: 0; font-size: 12.5px; }

.note { font-size: 11.5px; color: #555; }
.colophon { margin-top: 20px !important; font-size: 10.5px; color: #777; }

/* What the PDF actually is. The sheet loses its card treatment, the page box
   supplies the margins, and headings are not left stranded at a page foot. */
@media print {
  .no-print { display: none !important; }
  .report { max-width: none; margin: 0; }
  .sheet {
    border: none;
    border-radius: 0;
    box-shadow: none;
    padding: 0;
    font-size: 10pt;
  }
  section { margin-bottom: 22pt; }
  .break { break-before: page; }
  h2, h3 { break-after: avoid; }
  tr, .callout, .method div { break-inside: avoid; }
  thead { display: table-header-group; }
  .callout { background: none; padding-left: 12px; }
}
</style>
