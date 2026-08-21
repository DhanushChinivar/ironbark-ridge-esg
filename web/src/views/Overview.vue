<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { api } from '../api';
import { useAsync } from '../composables/useAsync';
import Panel from '../components/Panel.vue';
import Stat from '../components/Stat.vue';

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

type Priority = 'critical' | 'high' | 'medium' | 'low';
interface Item {
  priority: Priority;
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
      headline: `${a.totals.psychosocial} psychosocial hazards found, none coded as such`,
      detail:
        'All were filed under OTH. The register has no psychosocial type code, so they are invisible to a count by type.',
      to: '/safety',
    });
  }

  if (a.totals.severityInconsistent > 0) {
    items.push({
      priority: 'high',
      headline: `${a.totals.severityInconsistent} incidents recorded below the severity their description implies`,
      detail:
        'Includes two lost-time injuries — a fractured forearm requiring surgery, and lacerations requiring sutures — both recorded at severity 1.',
      to: '/safety',
    });
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
      headline: `March 2026: Scope 2 fell ${drop}% while Scope 1 rose ${rise}%`,
      detail:
        'A substation failure put the site on diesel generators for three weeks. Emissions did not fall — ' +
        `they moved between scopes, and the total changed by only ${Math.abs(Math.round((1 - mar.totalTco2e / feb.totalTco2e) * 100))}%.`,
      to: '/emissions',
    });
  }

  const meterGap = q.findings.find((f) => f.ruleCode === 'ELEC_METER_ID_GAP');
  if (meterGap) {
    items.push({
      priority: 'medium',
      headline: 'A metering point may be missing from the export',
      detail:
        'MTR-06 is absent from an otherwise complete sequence. It may have been decommissioned rather than omitted, ' +
        'so the impact cannot be quantified — this is a question for the site.',
      to: '/data-trust',
    });
  }

  if (e.monthsWithoutFuelData.length) {
    items.push({
      priority: 'medium',
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
      headline: `${flagged} rows loaded with a recorded concern`,
      detail: `Seven duplicate invoices, one credit note, two supplier records merged, and ${q.totals.fixed} corrections applied. Nothing was rejected.`,
      to: '/data-trust',
    });
  }

  return items;
});
</script>

<template>
  <div class="page">
    <div class="head">
      <h1 class="sans">Overview</h1>
      <p class="lede">
        Eighteen months of operational data, cleaned without discarding anything. Every figure below
        can be traced to the CSV line that produced it.
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
          unit="t"
          tone="oxide"
        />
        <Stat
          label="Scope 2 — electricity"
          :value="t(emissions.data.value?.totals.scope2Tco2e ?? 0)"
          unit="t"
          tone="slate"
        />
        <Stat
          label="Safety incidents"
          :value="String(incidents.data.value?.total ?? 0)"
          :note="`${ai.data.value?.totals.psychosocial ?? 0} psychosocial`"
        />
        <Stat
          label="Data quality findings"
          :value="String(quality.data.value?.totals.findings ?? 0)"
          :note="`${quality.data.value?.totals.rejected ?? 0} rows rejected`"
        />
      </div>
    </Panel>

    <Panel
      title="Attention required"
      :note="`${attention.length} items`"
      :loading="loading"
      :error="error"
    >
      <ol class="feed">
        <li v-for="(item, i) in attention" :key="i" :class="item.priority">
          <div class="tag eyebrow">{{ item.priority }}</div>
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

.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 24px;
}

.feed { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }

.feed li {
  display: grid;
  grid-template-columns: 78px 1fr;
  gap: 18px;
  padding: 16px 0;
  border-top: 1px solid var(--rule);
}
.feed li:first-child { border-top: none; padding-top: 0; }

.tag {
  padding-top: 4px;
  font-weight: 700;
}
.critical .tag { color: var(--critical); }
.high .tag { color: var(--oxide); }
.medium .tag { color: var(--amber); }
.low .tag { color: var(--ink-faint); }

.body { display: flex; flex-direction: column; gap: 5px; }

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
  .tag { padding-top: 0; }
}
</style>
