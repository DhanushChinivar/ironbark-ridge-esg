<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';
import { useAsync } from '../composables/useAsync';
import Panel from '../components/Panel.vue';
import Stat from '../components/Stat.vue';
import DonutChart, { type Segment } from '../components/DonutChart.vue';
import SafetyTabs from '../components/SafetyTabs.vue';

const summary = useAsync(() => api.incidentSummary());
const trends = useAsync(() => api.incidentTrends());
const ai = useAsync(() => api.aiFindings());

const loading = computed(() => summary.loading.value || ai.loading.value || trends.loading.value);
const error = computed(() => summary.error.value ?? ai.error.value ?? trends.error.value);

// Readable in the URL so the Overview can link straight at a finding type.
type Filter = 'psychosocial' | 'severity' | 'all';
const FILTERS: Filter[] = ['psychosocial', 'severity', 'all'];

const route = useRoute();
const router = useRouter();
const asFilter = (v: unknown): Filter =>
  FILTERS.includes(v as Filter) ? (v as Filter) : 'psychosocial';

const filter = ref<Filter>(asFilter(route.query.show));
watch(() => route.query.show, (v) => { filter.value = asFilter(v); });
watch(filter, (v) => { router.replace({ query: { ...route.query, show: v } }); });

const shown = computed(() => {
  const f = ai.data.value?.findings ?? [];
  if (filter.value === 'psychosocial') return f.filter((x) => x.isPsychosocial);
  if (filter.value === 'severity') return f.filter((x) => x.severityInconsistent);
  return f;
});

const months = computed(() => trends.data.value?.months ?? []);
const maxMonth = computed(() => Math.max(...months.value.map((m) => m.total), 1));

// The month bars carry three numbers each. Putting the breakdowns in a readout
// keeps the chart itself readable instead of stacking seven type colours.
const hovered = ref<number | null>(null);
const active = computed(() => (hovered.value === null ? null : months.value[hovered.value] ?? null));
const mix = (counts: Record<string, number>) =>
  Object.entries(counts)
    .map(([key, n]) => `${key} ×${n}`)
    .join('  ') || 'no incidents';

const severityLabel = (n: number | null) => (n === null ? 'severity not recorded' : `severity ${n}`);

// One hue, five rungs, darkest first. The register has eight type codes and a
// ring cannot carry eight colours a reader can still tell apart, so the tail
// folds into one neutral segment rather than inventing a sixth and seventh hue.
const RAMP = ['var(--ramp-1)', 'var(--ramp-2)', 'var(--ramp-3)', 'var(--ramp-4)', 'var(--ramp-5)'];

const byType = computed<Segment[]>(() => {
  const types = summary.data.value?.byType ?? [];
  const named = types.slice(0, RAMP.length).map((t, i) => ({
    label: t.typeCode ?? 'uncoded',
    value: t.count,
    color: RAMP[i]!,
  }));

  const rest = types.slice(RAMP.length).reduce((a, t) => a + t.count, 0);
  return rest
    ? [...named, { label: `other (${types.length - RAMP.length})`, value: rest, color: 'var(--ramp-rest)' }]
    : named;
});

// Severity is a risk band, not a rank, so it gets the risk scale rather than a
// shade of the house blue. Keyed on the severity itself, so a colour means the
// same thing whether or not every band is present.
const SEVERITY_COLOR: Record<string, string> = {
  '1': 'var(--sev-1)',
  '2': 'var(--sev-2)',
  '3': 'var(--sev-3)',
  '4': 'var(--sev-3)',
  '5': 'var(--sev-3)',
  unresolved: 'var(--sev-none)',
};
const severityColor = (severity: number | null) =>
  SEVERITY_COLOR[severity === null ? 'unresolved' : String(severity)] ?? 'var(--sev-none)';

// Stacked bars need the same scale as the donut, bottom to top by severity.
const stack = (counts: Record<string, number>, total: number) =>
  ['1', '2', '3', '4', '5', 'unresolved']
    .filter((k) => counts[k])
    .map((k) => ({
      key: k,
      count: counts[k]!,
      share: total ? (counts[k]! / total) * 100 : 0,
      color: SEVERITY_COLOR[k] ?? 'var(--sev-none)',
      label: k === 'unresolved' ? 'not recorded' : `severity ${k}`,
    }));

const severityKey = computed(() => {
  const seen = new Set<string>();
  for (const m of months.value) for (const k of Object.keys(m.bySeverity)) seen.add(k);
  return ['1', '2', '3', '4', '5', 'unresolved']
    .filter((k) => seen.has(k))
    .map((k) => ({
      key: k,
      color: SEVERITY_COLOR[k] ?? 'var(--sev-none)',
      label: k === 'unresolved' ? 'Not recorded' : `Severity ${k}`,
    }));
});

const bySeverity = computed<Segment[]>(() =>
  (summary.data.value?.bySeverity ?? []).map((b) => ({
    label: b.severity === null ? 'Not recorded' : `Severity ${b.severity}`,
    value: b.count,
    color: severityColor(b.severity),
  })),
);
</script>

<template>
  <div class="page">
    <div class="head">
      <h1 class="sans">Safety</h1>
      <p class="lede">
        All {{ ai.data.value?.totals.classified ?? 0 }} incident descriptions were analysed using
        AI. Every finding is backed by a quote from the original text.
      </p>
    </div>

    <SafetyTabs />

    <Panel :loading="loading" :error="error">
      <div class="stats">
        <Stat label="Incidents" :value="String(summary.data.value?.total ?? 0)" note="Jan 2025 – Jun 2026" />
        <Stat
          label="Psychosocial hazards"
          :value="String(ai.data.value?.totals.psychosocial ?? 0)"
          tone="oxide"
          note="AI-identified · none coded as such"
        />
        <Stat
          label="Severity concerns"
          :value="String(ai.data.value?.totals.severityInconsistent ?? 0)"
          tone="oxide"
          note="AI-identified · all recorded at severity 1"
        />
        <Stat
          label="Severity not recorded"
          :value="String(summary.data.value?.unresolvedSeverity ?? 0)"
          note="left blank, not guessed"
        />
      </div>
    </Panel>

    <div class="rings">
      <Panel title="By type" note="as coded in the register" :loading="loading" :error="error">
        <DonutChart
          :segments="byType"
          :centre-value="String(summary.data.value?.total ?? 0)"
          centre-caption="incidents"
        />
        <p class="caption">
          The type each incident was filed under by the person who reported it. There is no
          psychosocial code available to them, which is why those cases appear here as OTH.
        </p>
      </Panel>

      <Panel title="By severity" note="as recorded" :loading="loading" :error="error">
        <DonutChart
          :segments="bySeverity"
          :centre-value="String(summary.data.value?.total ?? 0)"
          centre-caption="incidents"
        />
        <p class="caption">
          Severity as entered in the register, from 1 (least severe) to 5. One incident has no
          severity recorded and is shown as such rather than assumed.
        </p>
      </Panel>
    </div>

    <Panel title="Incidents by month" :loading="loading" :error="error">
      <div class="trend">
        <div
          v-for="(m, i) in months"
          :key="m.month"
          class="col"
          @mouseenter="hovered = i"
          @mouseleave="hovered = null"
        >
          <div
            class="bar"
            :style="{ height: `${(m.total / maxMonth) * 100}%` }"
            :class="{ dim: hovered !== null && hovered !== i }"
          >
            <span v-if="m.total" class="n mono">{{ m.total }}</span>
            <span
              v-for="seg in stack(m.bySeverity, m.total)"
              :key="seg.key"
              class="seg"
              :style="{ height: `${seg.share}%`, background: seg.color }"
              :title="`${seg.count} at ${seg.label}`"
            />
          </div>
          <div class="lbl mono">{{ m.month.slice(5) }}</div>
        </div>
      </div>

      <ul class="key">
        <li v-for="k in severityKey" :key="k.key">
          <span class="swatch" :style="{ background: k.color }" />{{ k.label }}
        </li>
      </ul>

      <div class="readout mono" :class="{ dim: !active }">
        <template v-if="active">
          <b>{{ active.month }}</b>
          <span class="k">Severity</span>{{ mix(active.bySeverity) }}
          <span class="k">Type</span>{{ mix(active.byType) }}
        </template>
        <template v-else>Hover a month for its severity and type mix</template>
      </div>
    </Panel>

    <Panel title="AI findings" note="AI analysis · criteria-guided" :loading="loading" :error="error">
      <p class="lede-sm">
        Each finding below is grounded in a quote taken word for word from the incident
        description. A quote that cannot be found in the source text is discarded along with the
        finding it supports.
      </p>

      <div class="filters">
        <button :aria-pressed="filter === 'psychosocial'" @click="filter = 'psychosocial'">
          Psychosocial hazards ({{ ai.data.value?.totals.psychosocial ?? 0 }})
        </button>
        <button :aria-pressed="filter === 'severity'" @click="filter = 'severity'">
          Severity concerns ({{ ai.data.value?.totals.severityInconsistent ?? 0 }})
        </button>
        <button :aria-pressed="filter === 'all'" @click="filter = 'all'">
          All incidents ({{ ai.data.value?.totals.classified ?? 0 }})
        </button>
      </div>

      <ul class="findings">
        <li v-for="f in shown" :key="f.incidentId">
          <div class="meta mono">
            <span class="id">{{ f.sourceIncidentId }}</span>
            <span>{{ f.incidentDate }}</span>
            <span class="code">coded {{ f.typeCode ?? '—' }}</span>
            <span>{{ severityLabel(f.recordedSeverity) }}</span>
            <span v-if="f.isPsychosocial" class="chip psy">psychosocial</span>
            <span v-if="f.severityInconsistent" class="chip sev">
              suggests severity {{ f.suggestedSeverity }}
            </span>
            <span v-if="f.categoryConfidence !== null" class="conf">
              confidence {{ f.categoryConfidence.toFixed(2) }}
            </span>
          </div>

          <p class="desc">{{ f.description }}</p>

          <div class="quote">
            <span class="eyebrow strong">Evidence from the incident report</span>
            <q>{{ f.categoryEvidenceQuote }}</q>
          </div>

          <div class="why">
            <span class="eyebrow strong">Why this was flagged</span>
            <p class="reason">{{ f.categoryReasoning }}</p>
            <p v-if="f.severityInconsistent && f.severityReasoning" class="reason sev">
              {{ f.severityReasoning }}
            </p>
          </div>
        </li>
      </ul>
    </Panel>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 30px; }
.caption {
  margin: 16px 0 0;
  padding-top: 14px;
  border-top: 1px solid var(--rule);
  font-size: 12.5px;
  color: var(--ink-faint);
}

.rings { display: grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap: 30px; }
.head { display: flex; flex-direction: column; gap: 8px; }
h1 { margin: 0; font-size: 33px; font-weight: 800; }
.lede { margin: 0; max-width: 62ch; color: var(--ink-soft); font-size: 15.5px; }

.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 24px; }

.trend { display: flex; align-items: flex-end; gap: 6px; height: 150px; }
.col { flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; }
.bar {
  width: 100%;
  max-width: 30px;
  margin-top: auto;
  position: relative;
  min-height: 3px;
  border-radius: 4px 4px 0 0;
  overflow: hidden;
  display: flex;
  flex-direction: column-reverse;
}
/* Least severe at the base, so the coloured part that grows upward is the part
   that matters. */
.seg { display: block; width: 100%; }
.n { position: absolute; top: -16px; left: 50%; transform: translateX(-50%); font-size: 10px; color: var(--ink-faint); }
.bar.dim { opacity: 0.35; }
.lbl { font-size: 9.5px; color: var(--ink-faint); padding-top: 6px; }

.readout {
  font-size: 12px;
  color: var(--ink-soft);
  border-top: 1px solid var(--rule);
  margin-top: 14px;
  padding-top: 10px;
  min-height: 22px;
}
.readout.dim { color: var(--ink-faint); }
.readout b { color: var(--ink); }
.readout .k {
  display: inline-block;
  margin: 0 7px 0 16px;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-faint);
}

.lede-sm { margin: 0 0 16px; font-size: 13.5px; color: var(--ink-soft); max-width: 72ch; }

.key { list-style: none; display: flex; gap: 16px; flex-wrap: wrap; margin: 14px 0 0; padding: 0; }
.key li { display: flex; align-items: center; gap: 7px; font-size: 11.5px; color: var(--ink-faint); }
.key .swatch { width: 9px; height: 9px; border-radius: 2px; }

.filters { display: flex; gap: 6px; margin-bottom: 18px; flex-wrap: wrap; }
.conf { color: var(--ink-faint); }

.findings { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.findings li { padding: 18px 0; border-top: 1px solid var(--rule); display: flex; flex-direction: column; gap: 8px; }
.findings li:first-child { border-top: none; padding-top: 0; }

.meta { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; font-size: 11.5px; color: var(--ink-faint); }
.id { color: var(--ink); font-weight: 700; }
.code { color: var(--ink-soft); }

.chip {
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 2px 7px;
  border-radius: 2px;
  font-weight: 700;
}
.chip.psy { background: color-mix(in srgb, var(--oxide) 16%, transparent); color: var(--oxide); }
.chip.sev { background: color-mix(in srgb, var(--amber) 20%, transparent); color: var(--amber); }

.desc { margin: 0; font-size: 15px; max-width: 78ch; }

.eyebrow.strong { font-weight: 700; color: var(--ink-soft); }

.quote {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 9px 14px;
  background: var(--paper);
  border-left: 2px solid var(--slate);
  border-radius: 0 8px 8px 0;
}
.quote q { font-size: 14px; color: var(--ink-soft); font-style: italic; }

.why { display: flex; flex-direction: column; gap: 5px; }

.reason { margin: 0; font-size: 13.5px; color: var(--ink-faint); max-width: 78ch; }
.reason.sev { color: var(--amber); }
</style>
