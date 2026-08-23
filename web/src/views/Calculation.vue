<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { EmissionsCalculation } from '@contracts';
import { api } from '../api';
import Panel from '../components/Panel.vue';
import ScopeTabs from '../components/ScopeTabs.vue';

// Every figure on the Emissions page is an aggregate. This page shows the rows
// that aggregate summed, and then shows the aggregate again beside the hand
// total, so the claim is checkable rather than asserted.
const month = ref('2026-03');

// Corrected only. The as-reported basis is a comparison, and it already has a
// home on the Figures tab; here the correction shows up per row in the changed
// column, which is where a reader can see what it did rather than just its size.

const data = ref<EmissionsCalculation | null>(null);
const error = ref<string | null>(null);
const loading = ref(true);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    data.value = await api.calculation(month.value, 'corrected');
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}
watch(month, load, { immediate: true });

const months = computed(() => data.value?.availableMonths ?? []);
const n = (v: number, dp = 0) =>
  v.toLocaleString('en-AU', { minimumFractionDigits: dp, maximumFractionDigits: dp });

// Both figures come from separate queries. If they ever part company the page
// says so rather than showing whichever it happened to render first.
const agrees = computed(() => {
  const d = data.value;
  return d ? Math.abs(d.totalTco2e - d.reported.totalTco2e) < 0.15 : true;
});

const changedCount = computed(() =>
  (data.value?.scopes ?? []).reduce((a, s) => a + s.lines.filter((l) => l.changed).length, 0),
);

// Widest line in the month, so each row's bar is read against the biggest
// contributor rather than against the subtotal.
const widest = (lines: { kgCo2e: number }[]) => Math.max(...lines.map((l) => l.kgCo2e), 1);

const monthLabel = (m: string) =>
  new Date(`${m}-01T00:00:00`).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
</script>

<template>
  <div class="page">
    <div class="head">
      <div>
        <h1 class="sans">How this value was calculated</h1>
        <p class="lede">
          The rows behind one month, on the corrected basis the dashboard reports. Every line
          shows what the file said, what was used, the factor applied to it, and the result.
        </p>
      </div>
    </div>

    <ScopeTabs />

    <!-- The answer and the rule, before any evidence. A reader who only wants
         to know what the number is and where it comes from stops here. -->
    <Panel title="The rule" :note="monthLabel(month)" :loading="loading" :error="error">
      <div v-if="data" class="rule">
        <div class="formula sans">
          <span>quantity used</span><i>×</i><span>emission factor</span><i>÷</i><span>1,000</span>
          <i>=</i><b>tonnes CO₂e</b>
        </div>
        <div class="answer">
          <div v-for="scope in data.scopes" :key="scope.scope" class="scope" :class="`s${scope.scope}`">
            <div class="eyebrow">Scope {{ scope.scope }}</div>
            <div class="v sans num">{{ n(scope.subtotalTco2e, 1) }}<span class="u">t CO₂e</span></div>
            <div class="sub mono">{{ scope.countedLines }} {{ scope.countedLines === 1 ? 'row' : 'rows' }}</div>
          </div>
          <div class="scope total">
            <div class="eyebrow">Month total</div>
            <div class="v sans num">{{ n(data.totalTco2e, 1) }}<span class="u">t CO₂e</span></div>
            <div class="sub mono">{{ changedCount }} {{ changedCount === 1 ? 'row' : 'rows' }} changed by cleaning</div>
          </div>
        </div>
      </div>
    </Panel>

    <Panel title="Reporting period" note="pick a month">
      <div class="months">
        <button v-for="m in months" :key="m" :aria-pressed="month === m" @click="month = m">
          {{ monthLabel(m) }}
        </button>
      </div>
    </Panel>

    <Panel
      v-for="scope in data?.scopes ?? []"
      :key="scope.scope"
      class="scope-panel"
      :class="`s${scope.scope}`"
      :title="`Scope ${scope.scope} — ${scope.label}`"
      :note="`${scope.countedLines} of ${scope.lines.length} rows counted`"
      :loading="loading"
      :error="error"
    >
      <div class="scroll">
        <table class="calc">
          <thead>
            <tr>
              <th>Source row</th>
              <th>Reference</th>
              <th>Changed by cleaning</th>
              <th class="n">Used</th>
              <th>Factor</th>
              <th class="n">kg <span class="unit-case">CO₂e</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="line in scope.lines" :key="line.sourceRowNumber" :class="{ out: line.excludedBecause }">
              <td class="mono dim">{{ line.sourceFile }}:{{ line.sourceRowNumber }}</td>
              <td class="mono">{{ line.reference }}</td>
              <!-- A dash for the untouched majority so the corrections are the
                   only thing with ink in this column. -->
              <td class="mono">
                <template v-if="line.changed">
                  <span class="was">{{ line.asRecorded }}</span>
                  <span class="arrow">→</span>
                </template>
                <template v-else>
                  <span class="sr-only">unchanged</span>
                  <span class="none" aria-hidden="true">—</span>
                </template>
              </td>
              <td class="n mono" :class="{ corrected: line.changed }">
                {{ n(line.quantity, 1) }} {{ line.quantityUnit }}
              </td>
              <td class="factor">
                {{ line.factorActivity }}
                <span class="mono dim">× {{ line.factorPerUnit }} kg/{{ line.quantityUnit }}</span>
              </td>
              <td class="n mono result">
                <span class="bar" :style="{ width: `${(line.kgCo2e / widest(scope.lines)) * 100}%` }" />
                <template v-if="line.excludedBecause">
                  <s>{{ n(line.kgCo2e) }}</s>
                </template>
                <template v-else>{{ n(line.kgCo2e) }}</template>
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td colspan="5">Scope {{ scope.scope }} subtotal</td>
              <td class="n mono">{{ n(scope.subtotalKgCo2e) }}</td>
            </tr>
            <tr class="tonnes">
              <td colspan="5">÷ 1,000</td>
              <td class="n mono">{{ n(scope.subtotalTco2e, 1) }} t CO₂e</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <ul v-if="scope.lines.some((l) => l.excludedBecause)" class="notes">
        <li v-for="line in scope.lines.filter((l) => l.excludedBecause)" :key="line.sourceRowNumber">
          <b class="mono">{{ line.reference }}</b> struck through — {{ line.excludedBecause }}. The
          row is kept and shown; it is not added.
        </li>
      </ul>
    </Panel>

    <!-- Two independent paths to the same figure. The point is the agreement,
         not how each side was produced, so the wording stays in the reader's
         language and the mechanism stays in the code. -->
    <Panel title="Reconciliation check" :loading="loading" :error="error">
      <div v-if="data" class="check" :class="{ bad: !agrees }">
        <div class="col">
          <div class="eyebrow">Calculated from source records</div>
          <div class="big sans num">{{ n(data.totalTco2e, 1) }}<span class="u">t CO₂e</span></div>
        </div>

        <div class="eq sans">=</div>

        <div class="col">
          <div class="eyebrow">Shown on Emissions dashboard</div>
          <div class="big sans num">{{ n(data.reported.totalTco2e, 1) }}<span class="u">t CO₂e</span></div>
        </div>

        <div class="verdict sans" :class="agrees ? 'ok' : 'no'">
          {{ agrees ? '✓ Matches' : '✗ Does not match' }}
        </div>
      </div>

      <p v-if="data" class="foot">
        <template v-if="agrees">
          Independently calculated from the stored records.
        </template>
        <template v-else>
          The two do not agree. This is reported rather than hidden: until it is resolved, the
          figures on this page should not be relied on.
        </template>
      </p>
    </Panel>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 30px; }

.head { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; flex-wrap: wrap; }
h1 { margin: 0 0 8px; font-size: 33px; font-weight: 800; }
.lede { margin: 0; max-width: 66ch; color: var(--ink-soft); font-size: 15.5px; }
.months { display: flex; gap: 6px; flex-wrap: wrap; }

.rule { display: flex; flex-direction: column; gap: 20px; }
.formula {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 14.5px;
  font-weight: 600;
  padding: 12px 16px;
  border-radius: 12px;
  background: var(--paper);
  color: var(--ink-soft);
}
.formula i { font-style: normal; color: var(--ink-faint); font-size: 13px; }
.formula b { color: var(--ramp-1); }

.answer { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 22px; }
.scope .v { font-size: 27px; font-weight: 800; letter-spacing: -0.035em; line-height: 1.1; }
.scope .u { font-size: 12px; font-weight: 500; margin-left: 5px; color: var(--ink-faint); }
.scope .sub { font-size: 10.5px; color: var(--ink-faint); margin-top: 2px; }
.scope.s1 .v { color: var(--scope1); }
.scope.s2 .v { color: var(--scope2); }

.scroll { overflow-x: auto; }
.calc { width: 100%; border-collapse: collapse; font-size: 12.5px; min-width: 720px; }
.calc th {
  text-align: left;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-faint);
  font-weight: 600;
  padding: 0 14px 8px 0;
  border-bottom: 1px solid var(--rule);
}
/* A chemical formula is not a word: uppercasing it turns CO₂e into CO₂E. */
.unit-case { text-transform: none; }

.calc td { padding: 9px 14px 9px 0; border-bottom: 1px solid var(--rule); vertical-align: top; }
/* Right-align the numbers, but only drop the gutter on the last column -
   otherwise a right-aligned value butts straight into the next heading. */
.calc .n, .calc th.n { text-align: right; }
.calc td:last-child, .calc th:last-child { padding-right: 0; }
.calc td:nth-child(4) { padding-right: 22px; }
.calc th:nth-child(4) { padding-right: 22px; }
.calc .dim { color: var(--ink-faint); }
.calc tr.out td { color: var(--ink-faint); }
.factor { color: var(--ink-soft); }
.factor .mono { margin-left: 6px; font-size: 11.5px; }

/* Accents inside a scope table use that scope's colour, so a value corrected
   under Scope 1 is orange and the same treatment under Scope 2 is blue. */
.scope-panel.s1 { --accent: var(--scope1); }
.scope-panel.s2 { --accent: var(--scope2); }

.none { color: var(--rule); }
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.was { color: var(--ink-faint); text-decoration: line-through; }
.arrow { color: var(--accent); margin-left: 6px; }
.corrected { color: var(--accent); font-weight: 500; }

.result { position: relative; }
/* Relative size of each line, drawn behind the figure rather than in a column
   of its own - the number stays the thing being read. */
.result .bar {
  position: absolute;
  right: 0;
  bottom: 4px;
  height: 2px;
  border-radius: 999px;
  background: var(--accent);
  opacity: 0.4;
}

.calc tfoot td { border-bottom: none; padding-top: 12px; font-weight: 700; }
.calc tfoot .tonnes td { padding-top: 2px; color: var(--accent); }

.notes { margin: 14px 0 0; padding-left: 18px; font-size: 12.5px; color: var(--ink-faint); }
.notes b { color: var(--ink-soft); }

.check { display: flex; align-items: center; gap: 26px; flex-wrap: wrap; }
.col { flex: 1 1 200px; }
.big { font-size: 30px; font-weight: 800; letter-spacing: -0.035em; margin-top: 3px; }
.u { font-size: 13px; font-weight: 500; margin-left: 6px; color: var(--ink-faint); }
.eq { font-size: 26px; font-weight: 700; color: var(--ink-faint); }

.verdict {
  flex: 0 0 auto;
  font-size: 14px;
  font-weight: 700;
  padding: 8px 16px;
  border-radius: 999px;
}
.verdict.ok { color: #0a7d33; background: color-mix(in srgb, #0ca30c 13%, transparent); }
.verdict.no { color: var(--critical); background: color-mix(in srgb, var(--mark-critical) 13%, transparent); }
.check.bad .eq { color: var(--critical); }

.foot { margin: 16px 0 0; font-size: 12.5px; color: var(--ink-faint); max-width: 70ch; }
.check.bad ~ .foot { color: var(--critical); }
</style>
