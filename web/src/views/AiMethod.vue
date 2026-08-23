<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { AiTrace } from '@contracts';
import { api } from '../api';
import Panel from '../components/Panel.vue';
import SafetyTabs from '../components/SafetyTabs.vue';

// The Findings tab shows what the model concluded. This shows how it got there,
// for one incident at a time, using the same records the enrichment job used.
const chosen = ref<number | null>(null);
const data = ref<AiTrace | null>(null);
const error = ref<string | null>(null);
const loading = ref(true);
const showPrompt = ref(false);
const showFields = ref(false);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    data.value = await api.aiTrace(chosen.value);
    if (chosen.value === null) chosen.value = data.value.incident.incidentId;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}
watch(chosen, load, { immediate: true });

// The description split around the quote, so the check can be shown in place
// rather than described.
const highlighted = computed(() => {
  const d = data.value;
  if (!d) return null;
  const { description } = d.incident;
  const { quote, offset, found } = d.grounding;
  if (!found || offset < 0) return { before: description, match: '', after: '' };
  return {
    before: description.slice(0, offset),
    match: description.slice(offset, offset + quote.trim().length),
    after: description.slice(offset + quote.trim().length),
  };
});

const readable = (field: string) =>
  field.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
</script>

<template>
  <div class="page">
    <div class="head">
      <h1 class="sans">How this finding was generated</h1>
      <p class="lede">
        One incident, from the record as it was read to the finding that was stored. Nothing here
        is a summary of the process. It is the process, for the incident you pick.
      </p>
    </div>

    <SafetyTabs />

    <Panel title="Pick an incident" :note="`${data?.choices.length ?? 0} classified`" :loading="loading" :error="error">
      <select v-if="data" v-model="chosen" class="picker" aria-label="Incident">
        <option v-for="c in data.choices" :key="c.incidentId" :value="c.incidentId">
          {{ c.label }}
        </option>
      </select>
      <p class="hint">Incidents identified as psychosocial are listed first.</p>
    </Panel>

    <template v-if="data">
      <Panel class="step-panel" :step="1" title="Incident record" :note="data.incident.sourceIncidentId">
        <dl class="record">
          <div><dt>Reported</dt><dd class="mono">{{ data.incident.incidentDate }}</dd></div>
          <div><dt>Filed under</dt><dd class="mono">{{ data.incident.typeCode ?? 'no code' }}</dd></div>
          <div>
            <dt>Severity as written</dt>
            <dd class="mono">{{ data.incident.severityRaw || 'blank' }}</dd>
          </div>
        </dl>
        <p class="desc">{{ data.incident.description }}</p>
      </Panel>

      <Panel class="step-panel" :step="2" title="Classification criteria" :note="data.promptVersion">
        <p class="note">
          The instruction below is the exact text sent with every incident. It sets out the hazard
          categories, the psychosocial criteria taken from Queensland's Code of Practice, the
          threshold for questioning a severity, and the rule about quoting.
        </p>
        <button class="reveal" :aria-expanded="showPrompt" @click="showPrompt = !showPrompt">
          {{ showPrompt ? 'Hide the full instruction' : 'Show the full instruction' }}
        </button>
        <pre v-if="showPrompt" class="prompt mono">{{ data.systemPrompt }}</pre>
      </Panel>

      <Panel class="step-panel" :step="3" title="Incident data sent for analysis" note="this incident only">
        <pre class="prompt mono">{{ data.userMessage }}</pre>
        <p class="note">
          The model sees the description, the code it was filed under, and the severity as written.
          It is not given the hand-written label used to score it.
        </p>
      </Panel>

      <Panel class="step-panel" :step="4" title="AI assessment">
        <p class="note">
          The answer comes back through a tool with a fixed shape, so the model cannot reply with
          prose or invent a category outside the list it was given.
        </p>
        <dl class="record answer no-top">
          <div><dt>Category</dt><dd>{{ data.assessment.category }}</dd></div>
          <div>
            <dt>Psychosocial hazard</dt>
            <dd>{{ data.assessment.isPsychosocial ? 'Yes' : 'No' }}</dd>
          </div>
          <div v-if="data.assessment.confidence !== null">
            <dt>Confidence</dt>
            <dd class="mono">{{ data.assessment.confidence.toFixed(2) }}</dd>
          </div>
          <div v-if="data.assessment.severityInconsistent">
            <dt>Severity</dt>
            <dd>
              recorded {{ data.incident.recordedSeverity ?? 'not recorded' }}, suggests
              {{ data.assessment.suggestedSeverity }}
            </dd>
          </div>
        </dl>

        <p class="reason">{{ data.assessment.reasoning }}</p>
        <p v-if="data.assessment.severityReasoning" class="reason sev">
          {{ data.assessment.severityReasoning }}
        </p>

        <button class="reveal" :aria-expanded="showFields" @click="showFields = !showFields">
          {{ showFields ? 'Hide technical output' : 'View technical output' }}
        </button>
        <ul v-if="showFields" class="fields">
          <li v-for="f in data.outputFields" :key="f" class="mono">{{ readable(f) }}</li>
        </ul>
      </Panel>

      <Panel class="step-panel" :step="5" title="Evidence check" :note="data.grounding.found ? 'passed' : 'failed'">
        <p class="note">
          The model must quote the description word for word. That quote is searched for in the
          original text. If it is not there, the finding is thrown away rather than reported, which
          is what stops an invented detail reaching this dashboard.
        </p>

        <div class="proof" :class="{ bad: !data.grounding.found }">
          <div class="eyebrow strong">The quote, found in the original description</div>
          <p v-if="highlighted" class="marked">
            {{ highlighted.before }}<mark>{{ highlighted.match }}</mark>{{ highlighted.after }}
          </p>
          <div class="outcome">
            <span class="verdict sans" :class="data.grounding.found ? 'ok' : 'no'">
              {{ data.grounding.found ? '✓ Found in the source text' : '✗ Not found' }}
            </span>
            <span class="stored">{{ data.grounding.found ? 'Finding stored.' : 'Finding discarded.' }}</span>
          </div>
        </div>

        <p class="foot">
          This check is re-run each time this page is opened, against the description as stored. It
          is not a record of a check that happened once.
        </p>
      </Panel>
    </template>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 30px; }

/* A hairline down the left of each step, so the five cards read as one run
   rather than five unrelated panels. */
.step-panel { border-left: 3px solid var(--track); }
.head { display: flex; flex-direction: column; gap: 8px; }
h1 { margin: 0; font-size: 33px; font-weight: 800; }
.lede { margin: 0; max-width: 66ch; color: var(--ink-soft); font-size: 15.5px; }

.picker {
  font: inherit;
  font-weight: 600;
  font-size: 14px;
  color: var(--ink);
  padding: 8px 14px;
  border-radius: 999px;
  border: 1px solid var(--panel-edge);
  background: var(--panel);
  cursor: pointer;
  min-width: 260px;
}
.hint { margin: 10px 0 0; font-size: 12.5px; color: var(--ink-faint); }

.record { margin: 0 0 16px; display: flex; gap: 34px; flex-wrap: wrap; }
.record div { display: flex; flex-direction: column; gap: 2px; }
.record dt {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-faint);
}
.record dd { margin: 0; font-size: 14px; font-weight: 600; }
.record.answer { margin-top: 18px; }

.desc { margin: 0; font-size: 15px; max-width: 80ch; }
.note { margin: 0 0 14px; font-size: 13.5px; color: var(--ink-soft); max-width: 78ch; }

.reveal { font-size: 13px; }

.prompt {
  margin: 0;
  padding: 14px 16px;
  border-radius: 12px;
  background: var(--paper);
  font-size: 11.5px;
  line-height: 1.65;
  white-space: pre-wrap;
  color: var(--ink-soft);
  max-height: 420px;
  overflow: auto;
}
.prompt + .note { margin: 14px 0 0; }

.record.no-top { margin-top: 0; }
.reveal { margin-top: 16px; font-size: 13px; }
.fields { list-style: none; margin: 12px 0 0; padding: 0; display: flex; gap: 6px; flex-wrap: wrap; }
.fields li {
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--track);
  color: var(--ramp-2);
}

.reason { margin: 14px 0 0; font-size: 13.5px; color: var(--ink-faint); max-width: 78ch; }
.reason.sev { color: var(--amber); }

.eyebrow.strong { font-weight: 700; color: var(--ink-soft); }
.proof {
  padding: 16px 18px;
  border-radius: 12px;
  background: var(--paper);
  border-left: 3px solid #0ca30c;
}
.proof.bad { border-left-color: var(--critical); }
.marked { margin: 8px 0 14px; font-size: 15px; line-height: 1.7; max-width: 80ch; }

/* The quote shown where it sits, rather than repeated beside the description.
   Seeing it in place is the whole argument. */
mark {
  background: color-mix(in srgb, #0ca30c 20%, transparent);
  color: var(--ink);
  padding: 1px 2px;
  border-radius: 3px;
  font-weight: 600;
}

.outcome { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.stored { font-size: 13px; font-weight: 600; color: var(--ink-soft); }

.verdict {
  display: inline-block;
  font-size: 13.5px;
  font-weight: 700;
  padding: 6px 14px;
  border-radius: 999px;
}
.verdict.ok { color: #0a7d33; background: color-mix(in srgb, #0ca30c 13%, transparent); }
.verdict.no { color: var(--critical); background: color-mix(in srgb, var(--mark-critical) 13%, transparent); }

.foot { margin: 16px 0 0; font-size: 12.5px; color: var(--ink-faint); max-width: 74ch; }
</style>
