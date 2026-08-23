<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { api } from '../api';
import { useAsync } from '../composables/useAsync';
import Panel from '../components/Panel.vue';
import Stat from '../components/Stat.vue';
import DonutChart, { type Segment } from '../components/DonutChart.vue';
import MeterBar, { type Band } from '../components/MeterBar.vue';

const emissions = useAsync(() => api.emissions('corrected'));
const incidents = useAsync(() => api.incidentSummary());
const quality = useAsync(() => api.dataQuality());
const ai = useAsync(() => api.aiFindings());

const loading = computed(
  () => emissions.loading.value || incidents.loading.value || quality.loading.value || ai.loading.value,
);
const error = computed(
  () => emissions.error.value ?? incidents.error.value ?? quality.error.value ?? ai.error.value,
);

const t = (n: number) => n.toLocaleString('en-AU', { maximumFractionDigits: 0 });

// 2025-01 reads as a key, not a date, in the middle of a sentence.
const monthName = (month: string) =>
  new Date(`${month}-01T00:00:00`).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });

type Priority = 'critical' | 'high' | 'medium' | 'low';
// Where a finding came from. The feed mixes model output, rule output and
// arithmetic, and a reader is entitled to know which is which before acting.
type Source = 'ai' | 'data quality' | 'calculated' | 'trend';

interface Item {
  priority: Priority;
  source: Source;
  headline: string;
  detail: string;
  to: string;
}

// Ranked triage rather than a wall of numbers: what a sustainability lead has to
// act on, in the order they should look at it.
const attention = computed<Item[]>(() => {
  const e = emissions.data.value;
  const q = quality.data.value;
  const a = ai.data.value;
  if (!e || !q || !a) return [];

  const items: Item[] = [];

  if (e.correction.differenceTco2e > 0) {
    items.push({
      priority: 'critical',
      source: 'calculated',
      headline: `Scope 2 understated by ${t(e.correction.differenceTco2e)} t CO₂e before correction`,
      detail:
        'Meter MTR-07 reported megawatt-hours while labelled kWh from October 2025 and never recovered. ' +
        'Figures shown are corrected; the as-reported basis is one click away.',
      to: '/emissions',
    });
  }

  if (a.totals.psychosocial > 0) {
    items.push({
      priority: 'high',
      source: 'ai',
      headline: `${a.totals.psychosocial} psychosocial hazards found, none coded as such`,
      detail:
        'All were filed under OTH. The register has no psychosocial type code, so they are invisible to a count by type.',
      to: '/safety?show=psychosocial',
    });
  }

  if (a.totals.severityInconsistent > 0) {
    items.push({
      priority: 'high',
      source: 'ai',
      headline: `${a.totals.severityInconsistent} incidents recorded below the severity their description implies`,
      detail:
        'Two are lost-time injuries: a fractured forearm requiring surgery, and lacerations requiring sutures. Both were recorded at severity 1.',
      to: '/safety?show=severity',
    });
  }

  // Both scopes measured the same way over the same window, first reported month
  // to last. Comparing endpoints on one series and a mean on the other would be
  // picking the method that gives the answer.
  const reported = e.months.filter((m) => m.hasFuelData);
  const opening = reported[0];
  const closing = reported.at(-1);
  if (opening && closing && opening.scope1Tco2e > 0 && opening.scope2Tco2e > 0) {
    const fuel = closing.scope1Tco2e / opening.scope1Tco2e - 1;
    const grid = closing.scope2Tco2e / opening.scope2Tco2e - 1;
    // Only worth raising where one scope moved and the other did not: two series
    // drifting together is a change in output, not a change in energy mix.
    if (fuel > 0.15 && Math.abs(grid) < 0.1) {
      items.push({
        priority: 'high',
        source: 'trend',
        headline: `Scope 1 has risen ${Math.round(fuel * 100)}% since ${monthName(opening.month)}, with Scope 2 flat`,
        detail:
          `Grid electricity ${grid < 0 ? 'fell' : 'rose'} ${Math.abs(Math.round(grid * 100))}% across the ` +
          'same window, so the growth in total emissions is fuel alone. Measured after seven ' +
          'duplicated invoices were excluded from ' +
          'the totals; counting them would have overstated the rise. What is driving it, whether a ' +
          'deeper pit, longer hauls or more plant, is a question for the site.',
        to: '/emissions',
      });
    }
  }

  // The cross-dataset finding: emissions moved between scopes rather than falling.
  const months = e.months;
  const mar = months.find((m) => m.month === '2026-03');
  const feb = months.find((m) => m.month === '2026-02');
  if (mar && feb && mar.scope2Tco2e < feb.scope2Tco2e * 0.6) {
    const drop = Math.round((1 - mar.scope2Tco2e / feb.scope2Tco2e) * 100);
    const rise = Math.round((mar.scope1Tco2e / feb.scope1Tco2e - 1) * 100);
    items.push({
      priority: 'medium',
      source: 'trend',
      headline: `March 2026: Scope 2 fell ${drop}% while Scope 1 rose ${rise}%`,
      detail:
        'A substation failure put the site on diesel generators for three weeks. Emissions did not fall, ' +
        `they moved between scopes, and the total changed by only ${Math.abs(Math.round((1 - mar.totalTco2e / feb.totalTco2e) * 100))}%.`,
      to: '/emissions',
    });
  }

  const meterGap = q.findings.find((f) => f.ruleCode === 'ELEC_METER_ID_GAP');
  if (meterGap) {
    items.push({
      priority: 'medium',
      source: 'data quality',
      headline: 'A metering point may be missing from the export',
      detail:
        'MTR-06 is absent from an otherwise complete sequence. It may have been decommissioned rather than omitted, ' +
        'so the impact cannot be quantified. This is a question for the site.',
      to: '/data-trust',
    });
  }

  if (e.monthsWithoutFuelData.length) {
    items.push({
      priority: 'medium',
      source: 'data quality',
      headline: `No fuel delivery data for ${e.monthsWithoutFuelData.join(', ')}`,
      detail:
        'Reported as a gap rather than as zero litres. Scope 1 for that month is unknown, not nil.',
      to: '/emissions',
    });
  }

  const flagged = q.totals.flagged;
  if (flagged) {
    items.push({
      priority: 'low',
      source: 'data quality',
      headline: `${flagged} rows loaded with a recorded concern`,
      detail: `Seven duplicate invoices, one credit note, two supplier records merged, and ${q.totals.fixed} corrections applied. Nothing was rejected.`,
      to: '/data-trust',
    });
  }

  return items;
});

// Two readings of the same feed. Priority says how much is urgent; source says
// how much of it a model produced rather than a rule or a calculation - which is
// the question a reviewer of an AI project actually has.
function group<T extends string>(
  keys: T[],
  of: (i: Item) => T,
  style: Record<T, { label: string; color: string }>,
): Segment[] {
  return keys
    .map((key) => ({
      label: style[key].label,
      value: attention.value.filter((i) => of(i) === key).length,
      color: style[key].color,
    }))
    .filter((seg) => seg.value > 0);
}

const byPriority = computed(() =>
  group<Priority>(['critical', 'high', 'medium', 'low'], (i) => i.priority, {
    critical: { label: 'Critical', color: 'var(--mark-critical)' },
    high: { label: 'High', color: 'var(--mark-serious)' },
    medium: { label: 'Medium', color: 'var(--mark-warning)' },
    low: { label: 'Low', color: 'var(--ramp-rest)' },
  }),
);

// Reporting coverage: months where both a fuel and an electricity figure exist.
// A month missing one is shown as missing, never filled in with a zero.
const coverage = computed(() => {
  const months = emissions.data.value?.months ?? [];
  const complete = months.filter((m) => m.hasFuelData && m.hasElectricityData).length;
  const bands: Band[] = [
    { label: 'Both sources present', value: complete, color: 'var(--ramp-3)' },
    {
      label: 'No fuel deliveries recorded',
      value: months.filter((m) => !m.hasFuelData).length,
      color: 'var(--mark-warning)',
    },
    {
      label: 'No meter readings recorded',
      value: months.filter((m) => !m.hasElectricityData).length,
      color: 'var(--mark-critical)',
    },
  ];
  return { total: months.length, complete, bands };
});

const bySource = computed(() =>
  group<Source>(['ai', 'data quality', 'calculated', 'trend'], (i) => i.source, {
    ai: { label: 'AI', color: 'var(--oxide)' },
    'data quality': { label: 'Data quality', color: 'var(--ramp-3)' },
    calculated: { label: 'Calculated', color: 'var(--ramp-1)' },
    trend: { label: 'Trend', color: 'var(--ramp-5)' },
  }),
);
</script>

<template>
  <div class="page">
    <div class="head">
      <h1 class="sans">Overview</h1>
      <p class="lede">
        Eighteen months of operational data, cleaned and reconciled without silently
        discarding source records. Every figure and finding traces back to the CSV line
        that produced it.
      </p>
    </div>

    <Panel :loading="loading" :error="error">
      <div class="stats">
        <Stat
          label="Total emissions"
          :value="t(emissions.data.value?.totals.totalTco2e ?? 0)"
          unit="t CO₂e"
          note="Corrected basis"
        />
        <Stat
          label="Scope 1 — fuel"
          :value="t(emissions.data.value?.totals.scope1Tco2e ?? 0)"
          unit="t CO₂e"
          tone="oxide"
        />
        <Stat
          label="Scope 2 — electricity"
          :value="t(emissions.data.value?.totals.scope2Tco2e ?? 0)"
          unit="t CO₂e"
          tone="slate"
          :note="emissions.data.value ? `+${t(emissions.data.value.correction.differenceTco2e)} t vs as reported` : ''"
        />
        <Stat
          label="Safety incidents"
          :value="String(incidents.data.value?.total ?? 0)"
          :note="`${ai.data.value?.totals.psychosocial ?? 0} AI-identified psychosocial hazards`"
        />
        <Stat
          label="Data quality findings"
          :value="String(quality.data.value?.totals.findings ?? 0)"
          :note="quality.data.value
            ? `${quality.data.value.totals.fixed} fixed · ${quality.data.value.totals.flagged} flagged · ${quality.data.value.totals.rejected} rejected`
            : ''"
        />
      </div>
    </Panel>

    <div class="rings">
      <Panel title="By priority" note="what to look at first" :loading="loading" :error="error">
        <DonutChart
          :segments="byPriority"
          :centre-value="String(attention.length)"
          centre-caption="items"
        />
      </Panel>

      <Panel title="How findings were identified" note="rule, calculation or model" :loading="loading" :error="error">
        <DonutChart
          :segments="bySource"
          :centre-value="String(attention.filter((i) => i.source === 'ai').length)"
          centre-caption="from AI"
        />
      </Panel>

      <Panel title="Reporting coverage" note="months with both sources" :loading="loading" :error="error">
        <MeterBar
          :headline="`${coverage.complete} of ${coverage.total} months have both fuel and electricity data`"
          :value="coverage.complete"
          :of="coverage.total"
          :bands="coverage.bands"
        />
      </Panel>
    </div>

    <Panel
      title="Attention required"
      :note="`${attention.length} items`"
      :loading="loading"
      :error="error"
    >
      <ol class="feed">
        <li v-for="(item, i) in attention" :key="i" :class="item.priority">
          <RouterLink :to="item.to" class="hit" :aria-label="item.headline" />
          <div class="tags">
            <span class="tag eyebrow">{{ item.priority }}</span>
            <span class="src eyebrow" :class="item.source.replace(' ', '-')">{{ item.source }}</span>
          </div>
          <div class="body">
            <RouterLink :to="item.to" class="headline sans">{{ item.headline }}</RouterLink>
            <p>{{ item.detail }}</p>
          </div>
        </li>
      </ol>
    </Panel>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 30px; }

.head { display: flex; flex-direction: column; gap: 8px; }
h1 { margin: 0; font-size: 33px; font-weight: 800; }
.lede { margin: 0; max-width: 62ch; color: var(--ink-soft); font-size: 15.5px; }

.rings { display: grid; grid-template-columns: repeat(auto-fit, minmax(345px, 1fr)); gap: 24px; }

.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 24px;
}

.feed { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }

.feed li {
  display: grid;
  grid-template-columns: 104px 1fr;
  gap: 18px;
  padding: 16px 14px 16px 0;
  border-top: 1px solid var(--rule);
  position: relative;
  border-radius: 10px;
}

/* The row is the target. A headline-only link makes a reader aim at text. */
.hit { position: absolute; inset: 0; z-index: 1; }
.feed li:hover { background: color-mix(in srgb, var(--ramp-5) 8%, transparent); }
.feed li:hover .headline { text-decoration: underline; text-underline-offset: 3px; }
.feed li:has(.hit:focus-visible) { outline: 2px solid var(--ramp-3); outline-offset: 2px; }
.feed li:first-child { border-top: none; }

.tags { display: flex; flex-direction: column; gap: 5px; padding-top: 4px; align-items: flex-start; }
.tag { font-weight: 700; }

/* Priority says how urgent; source says where it came from. A reader deciding
   whether to act on a finding needs both. */
.src {
  font-size: 8.5px;
  letter-spacing: 0.1em;
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--track);
  color: var(--ramp-2);
}
.src.ai { background: color-mix(in srgb, var(--oxide) 14%, transparent); color: var(--oxide); }
.critical .tag { color: var(--critical); }
.high .tag { color: var(--oxide); }
.medium .tag { color: var(--amber); }
.low .tag { color: var(--ink-faint); }

.body { display: flex; flex-direction: column; gap: 5px; }
.tags, .body { position: relative; z-index: 2; pointer-events: none; }
.headline { pointer-events: auto; }

.headline {
  font-size: 16px;
  font-weight: 600;
  text-decoration: none;
  letter-spacing: -0.005em;
}
.headline:hover { text-decoration: underline; text-underline-offset: 3px; }

.body p { margin: 0; font-size: 14.5px; color: var(--ink-soft); max-width: 76ch; }

@media (max-width: 620px) {
  .feed li { grid-template-columns: 1fr; gap: 6px; }
  .tags { flex-direction: row; align-items: center; padding-top: 0; }
}
</style>
