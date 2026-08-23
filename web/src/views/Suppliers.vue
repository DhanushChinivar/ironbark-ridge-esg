<script setup lang="ts">
import { computed } from 'vue';
import { api } from '../api';
import { useAsync } from '../composables/useAsync';
import Panel from '../components/Panel.vue';
import SubTabs from '../components/SubTabs.vue';

const tabs = [
  { to: '/data-trust', label: 'Ledger' },
  { to: '/data-trust/suppliers', label: 'How records were matched' },
];

const res = useAsync(() => api.suppliers());
const companies = computed(() => res.data.value?.companies ?? []);
const totals = computed(() => res.data.value?.totals);

// Merged companies first: they are the reason this page exists, and a reader
// scanning from the top should meet the judgement before the routine rows.
const ordered = computed(() =>
  [...companies.value].sort((a, b) => b.mergedFrom.length - a.mergedFrom.length),
);

const money = (n: number | null) =>
  n === null ? 'not recorded' : `$${(n / 1_000_000).toFixed(2)}M`;

// What the weaker merge is worth, stated as money rather than as a row count.
const atStake = computed(() => {
  const inferred = companies.value.flatMap((c) =>
    c.mergedFrom.filter((m) => !m.proven).map((m) => m.spendAud ?? 0),
  );
  return inferred.reduce((a, b) => a + b, 0);
});
</script>

<template>
  <div class="page">
    <div class="head">
      <h1 class="sans">How records were matched</h1>
      <p class="lede">
        Fifteen rows in the supplier file name thirteen companies. Deciding which rows describe the
        same business is a judgement, and not every judgement here rests on the same strength of
        evidence. This page shows which is which.
      </p>
    </div>

    <SubTabs :tabs="tabs" />

    <Panel title="Supplier spend is reported separately" :loading="res.loading.value" :error="res.error.value">
      <p class="standalone">
        This file does not feed either emissions figure. The delivery records carry an invoice
        number and a site, but no supplier, so there is no reliable way to attribute fuel to the
        company that supplied it. Supplier spend would belong to Scope 3, which is outside the
        scope of this report. What the file supports is attribution: knowing who the site buys
        from, and how much.
      </p>
    </Panel>

    <Panel v-if="totals" title="What the file resolved to">
      <div class="counts">
        <div>
          <span class="fig sans">{{ res.data.value!.rowsRead }}</span>
          <span class="cap">rows read</span>
        </div>
        <div class="to" aria-hidden="true">→</div>
        <div>
          <span class="fig sans">{{ totals.companies }}</span>
          <span class="cap">companies</span>
        </div>
        <div class="split">
          <div class="chip proven">
            <b>{{ totals.provenMerges }}</b> merged on a shared ABN
            <span class="sub">proven</span>
          </div>
          <div class="chip inferred">
            <b>{{ totals.inferredMerges }}</b> merged on name alone
            <span class="sub">inferred</span>
          </div>
        </div>
      </div>
      <p class="note">
        Two rows sharing an ABN are the same registered business, and that is a fact. Two rows with
        similar names are probably the same business, and that is an opinion. Both were merged, but
        the difference is recorded against each one rather than averaged away.
        <template v-if="atStake > 0">
          The inferred match moves <b>${{ (atStake / 1_000_000).toFixed(2) }}M</b> of spend onto a
          company it was not proven to belong to.
        </template>
      </p>
    </Panel>

    <Panel title="Companies" :note="`${ordered.length} after matching`" :loading="res.loading.value">
      <table class="tbl">
        <thead>
          <tr>
            <th>Company</th>
            <th>ABN</th>
            <th>Category</th>
            <th class="n">Spend</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="c in ordered" :key="c.supplierId">
            <tr :class="{ lead: c.mergedFrom.length > 0 }">
              <td>
                <span class="name">{{ c.name }}</span>
                <span class="mono dim src">suppliers.csv:{{ c.sourceRowNumber }}</span>
              </td>
              <td class="mono">
                <template v-if="c.abn">{{ c.abn }}</template>
                <span v-else class="miss">not recorded</span>
                <span v-if="c.abnFormatValid === false" class="warn">not 11 digits</span>
              </td>
              <td class="cat">{{ c.category ?? '—' }}</td>
              <td class="n mono">{{ money(c.totalSpendAud) }}</td>
            </tr>

            <!-- The absorbed row, kept visible under the company it was folded
                 into, so a merge can be checked rather than taken on trust. -->
            <tr v-for="m in c.mergedFrom" :key="m.sourceRowNumber" class="merged">
              <td>
                <span class="join" aria-hidden="true">└</span>
                <span class="was">{{ m.name }}</span>
                <span class="mono dim src">suppliers.csv:{{ m.sourceRowNumber }}</span>
              </td>
              <td class="mono">
                <template v-if="m.abn">{{ m.abn }}</template>
                <span v-else class="miss">no ABN</span>
              </td>
              <td>
                <span class="tag sans" :class="m.proven ? 'proven' : 'inferred'">
                  {{ m.proven ? 'matched on ABN' : 'matched on name' }}
                </span>
                <span v-if="m.discardedCategory" class="clash">
                  said &ldquo;{{ m.discardedCategory }}&rdquo;
                </span>
              </td>
              <td class="n mono dim">{{ money(m.spendAud) }}</td>
            </tr>
          </template>
        </tbody>
      </table>

      <ul class="notes">
        <li>
          Spend on a merged company is the sum of its rows. Reporting only the row that survived
          would understate what the site spent with that supplier.
        </li>
        <li>
          Where two rows disagreed on a field, the canonical value is kept and the other is
          reported rather than dropped without trace. A merge is the point at which a category
          could change without anyone noticing.
        </li>
        <li>
          A merge is never destructive. Both rows stay in the database with the match method
          recorded against them, so an inferred match can be reversed without reloading the file.
        </li>
      </ul>
    </Panel>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 30px; }
.head { display: flex; flex-direction: column; gap: 8px; }
h1 { margin: 0; font-size: 33px; font-weight: 800; }
.lede { margin: 0; max-width: 68ch; color: var(--ink-soft); font-size: 15.5px; }

.standalone { margin: 0; font-size: 13.5px; color: var(--ink-soft); max-width: 78ch; }

.counts { display: flex; align-items: center; gap: 26px; flex-wrap: wrap; }
.counts > div { display: flex; flex-direction: column; gap: 2px; }
.fig { font-size: 30px; font-weight: 800; line-height: 1; }
.cap {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-faint);
}
.to { font-size: 20px; color: var(--ink-faint); }
.split { flex-direction: row !important; gap: 10px; margin-left: 12px; }

.chip {
  display: flex;
  flex-direction: column;
  gap: 1px;
  font-size: 12.5px;
  padding: 8px 14px;
  border-radius: 12px;
  background: var(--paper);
  border-left: 3px solid var(--ramp-rest);
}
.chip.proven { border-left-color: var(--act-fixed); }
.chip.inferred { border-left-color: var(--act-flagged); }
.chip .sub {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9.5px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-faint);
}

.note { margin: 18px 0 0; font-size: 13px; color: var(--ink-soft); max-width: 80ch; line-height: 1.6; }

.tbl { width: 100%; border-collapse: collapse; font-size: 13.5px; }
.tbl th {
  text-align: left;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-faint);
  font-weight: 500;
  padding: 0 12px 10px 0;
  border-bottom: 1px solid var(--panel-edge);
}
.tbl td { padding: 9px 12px 9px 0; border-bottom: 1px solid var(--hairline); vertical-align: baseline; }
.tbl .n { text-align: right; padding-right: 0; }
.tbl th.n { text-align: right; }

.lead td { border-bottom: none; }
.name { font-weight: 600; }
.src { font-size: 10.5px; margin-left: 8px; }
.dim { color: var(--ink-faint); }
.cat { color: var(--ink-soft); }
.miss { color: var(--ink-faint); font-style: italic; }
.warn { margin-left: 8px; font-size: 11px; color: var(--act-flagged-ink); }

.merged td { background: color-mix(in srgb, var(--paper) 60%, transparent); }
.join { color: var(--ink-faint); margin-right: 8px; }
.was { color: var(--ink-soft); }

.tag {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.03em;
  padding: 3px 9px;
  border-radius: 999px;
}
.tag.proven { color: var(--act-fixed); background: color-mix(in srgb, var(--act-fixed) 12%, transparent); }
.tag.inferred { color: var(--act-flagged-ink); background: color-mix(in srgb, var(--act-flagged) 18%, transparent); }

.clash {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: var(--act-flagged-ink);
}

.notes { margin: 16px 0 0; padding-left: 18px; font-size: 12.5px; color: var(--ink-faint); line-height: 1.6; }
.notes li + li { margin-top: 6px; }
</style>
