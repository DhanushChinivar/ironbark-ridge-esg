<script setup lang="ts">
import { computed, ref } from 'vue';
import { api } from '../api';
import { useAsync } from '../composables/useAsync';
import Panel from '../components/Panel.vue';
import Stat from '../components/Stat.vue';
import DonutChart, { type Segment } from '../components/DonutChart.vue';

const summary = useAsync(() => api.incidentSummary());
const trends = useAsync(() => api.incidentTrends());
const ai = useAsync(() => api.aiFindings());

const loading = computed(() => summary.loading.value || ai.loading.value || trends.loading.value);
const error = computed(() => summary.error.value ?? ai.error.value ?? trends.error.value);

type Filter = 'psychosocial' | 'severity' | 'all';
const filter = ref<Filter>('psychosocial');

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

const severityLabel = (n: number | null) => (n === null ? 'unresolved' : `severity ${n}`);

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

// Severity is genuinely ordered, so the ramp does its proper job here: darker
// means more severe. Keyed on the severity itself rather than on position, so
// the shade means the same thing whether or not every band is present, and
// stepped by two rungs because neighbouring rungs are too close to read apart.
const severityColor = (severity: number) =>
  RAMP[Math.max(RAMP.length - 1 - (severity - 1) * 2, 0)]!;

const bySeverity = computed<Segment[]>(() =>
  (summary.data.value?.bySeverity ?? []).map((b) => ({
    label: b.severity === null ? 'unresolved' : `severity ${b.severity}`,
    value: b.count,
    color: b.severity === null ? 'var(--ramp-rest)' : severityColor(b.severity),
  })),
);
</script>

<template>
  <div class="page">
    <div class="head">
      <h1 class="sans">Safety</h1>
      <p class="lede">
        Forty-two incidents, classified by a model that must quote the description it is reading. A
        quote that is not found in the source text discards the finding it supports.
      </p>
    </div>

    <Panel :loading="loading" :error="error">
      <div class="stats">
        <Stat label="Incidents" :value="String(summary.data.value?.total ?? 0)" note="Jan 2025 – Jun 2026" />
        <Stat
          label="Psychosocial hazards"
          :value="String(ai.data.value?.totals.psychosocial ?? 0)"
          tone="oxide"
          note="none coded as such"
        />
        <Stat
          label="Severity inconsistencies"
          :value="String(ai.data.value?.totals.severityInconsistent ?? 0)"
          tone="oxide"
          note="all recorded at severity 1"
        />
        <Stat
          label="Unresolved severity"
          :value="String(summary.data.value?.unresolvedSeverity ?? 0)"
          note="left null, not guessed"
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
      </Panel>

      <Panel title="By severity" note="as recorded" :loading="loading" :error="error">
        <DonutChart
          :segments="bySeverity"
          :centre-value="String(summary.data.value?.total ?? 0)"
          centre-caption="incidents"
        />
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
          </div>
          <div class="lbl mono">{{ m.month.slice(5) }}</div>
        </div>
      </div>

      <div class="readout mono" :class="{ dim: !active }">
        <template v-if="active">
          <b>{{ active.month }}</b>
          <span class="k">Severity</span>{{ mix(active.bySeverity) }}
          <span class="k">Type</span>{{ mix(active.byType) }}
        </template>
        <template v-else>Hover a month for its severity and type mix</template>
      </div>
    </Panel>

    <Panel title="AI findings" :note="`${ai.data.value?.model ?? ''} · ${ai.data.value?.promptVersion ?? ''}`" :loading="loading" :error="error">
      <div class="filters">
        <button :aria-pressed="filter === 'psychosocial'" @click="filter = 'psychosocial'">
          Psychosocial
        </button>
        <button :aria-pressed="filter === 'severity'" @click="filter = 'severity'">
          Severity concerns
        </button>
        <button :aria-pressed="filter === 'all'" @click="filter = 'all'">All 42</button>
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
          </div>

          <p class="desc">{{ f.description }}</p>

          <div class="quote">
            <span class="eyebrow">Evidence</span>
            <q>{{ f.categoryEvidenceQuote }}</q>
          </div>

          <p class="reason">{{ f.categoryReasoning }}</p>
          <p v-if="f.severityInconsistent && f.severityReasoning" class="reason sev">
            {{ f.severityReasoning }}
          </p>
        </li>
      </ul>
    </Panel>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 30px; }
.rings { display: grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap: 30px; }
.head { display: flex; flex-direction: column; gap: 8px; }
h1 { margin: 0; font-size: 30px; font-weight: 700; letter-spacing: -0.02em; }
.lede { margin: 0; max-width: 66ch; color: var(--ink-soft); }

.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 24px; }

.trend { display: flex; align-items: flex-end; gap: 6px; height: 150px; }
.col { flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; }
.bar {
  width: 100%;
  max-width: 30px;
  background: var(--ramp-3);
  margin-top: auto;
  position: relative;
  min-height: 3px;
  border-radius: 4px 4px 0 0;
}
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

.filters { display: flex; gap: 6px; margin-bottom: 18px; flex-wrap: wrap; }

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

.quote { display: flex; gap: 10px; align-items: baseline; padding: 8px 12px; background: var(--paper); border-left: 2px solid var(--slate); }
.quote q { font-size: 14px; color: var(--ink-soft); font-style: italic; }

.reason { margin: 0; font-size: 13.5px; color: var(--ink-faint); max-width: 78ch; }
.reason.sev { color: var(--amber); }
</style>
