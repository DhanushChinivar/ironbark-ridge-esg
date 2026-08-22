// Scores the classifier against the hand-written labels and prints every
// disagreement, so a reader can audit the labels rather than trust them.
//
//   npm run evaluate                          scores the prompt the dashboard reads
//   npm run evaluate -- --prompt=no-criteria  scores an ablation stored alongside it
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { incident, incidentClassification, incidentLabel, severityFlag } from '../db/schema.js';
import { ACTIVE_PROMPT, resolvePrompt } from '../ai/prompt.js';

const requested = process.argv.find((a) => a.startsWith('--prompt='))?.split('=')[1];
const prompt = resolvePrompt(requested ?? ACTIVE_PROMPT);

const rows = await db
  .select({
    sourceIncidentId: incident.sourceIncidentId,
    incidentDate: incident.incidentDate,
    description: incident.description,
    recordedSeverity: incident.severityNormalised,
    expectedCategory: incidentLabel.expectedCategory,
    expectedPsychosocial: incidentLabel.isPsychosocial,
    expectedSeverityConcern: incidentLabel.severityConcern,
    labelRationale: incidentLabel.rationale,
    predictedCategory: incidentClassification.category,
    predictedPsychosocial: incidentClassification.isPsychosocial,
    categoryConfidence: incidentClassification.confidence,
    categoryReasoning: incidentClassification.reasoning,
    categoryQuote: incidentClassification.evidenceQuote,
    model: incidentClassification.model,
    promptVersion: incidentClassification.promptVersion,
    predictedSeverityConcern: severityFlag.isInconsistent,
    suggestedSeverity: severityFlag.suggestedSeverity,
    severityConfidence: severityFlag.confidence,
    severityReasoning: severityFlag.reasoning,
  })
  .from(incidentLabel)
  .innerJoin(incident, eq(incident.id, incidentLabel.incidentId))
  .leftJoin(
    incidentClassification,
    and(
      eq(incidentClassification.incidentId, incidentLabel.incidentId),
      eq(incidentClassification.promptVersion, prompt.version),
    ),
  )
  .leftJoin(
    severityFlag,
    and(
      eq(severityFlag.incidentId, incidentLabel.incidentId),
      eq(severityFlag.promptVersion, prompt.version),
    ),
  )
  .orderBy(incident.incidentDate);

if (!rows.length) throw new Error('No labels found. Run "npm run label" first.');

if (rows.every((r) => r.predictedCategory === null)) {
  throw new Error(`No results stored for ${prompt.version}. Run "npm run enrich -- --prompt=${prompt.version}" first.`);
}

// Plain counts rather than metric names: at 42 rows the words carry more.
// "Missed" is recall and "false alarms" is precision, if asked.
function tally(found: boolean[], expected: boolean[]) {
  let hit = 0, missed = 0, falseAlarm = 0;
  found.forEach((f, i) => {
    const e = expected[i]!;
    if (f && e) hit += 1;
    else if (!f && e) missed += 1;
    else if (f && !e) falseAlarm += 1;
  });
  return { hit, missed, falseAlarm, inLabels: hit + missed };
}

const rightCategory = rows.filter((r) => r.predictedCategory === r.expectedCategory).length;
const psycho = tally(rows.map((r) => r.predictedPsychosocial ?? false), rows.map((r) => r.expectedPsychosocial));
const sev = tally(rows.map((r) => r.predictedSeverityConcern ?? false), rows.map((r) => r.expectedSeverityConcern));

// enrich stores nothing when a quote fails, so the join comes back empty.
const dropped = rows.filter((r) => r.predictedCategory === null).length;

const pad = (n: number) => String(n).padStart(3);

console.log(`\nChecked ${rows.length} incidents against ${rows.length} hand-written labels.`);
console.log(`Model ${rows[0]?.model}, prompt ${prompt.version}.\n`);

console.log('Hazard category');
console.log(`  got right             ${pad(rightCategory)} of ${rows.length}`);
console.log(`  got wrong             ${pad(rows.length - rightCategory)}`);

console.log(`\nPsychosocial hazards      ${pad(psycho.inLabels)} in the labels`);
console.log(`  found                 ${pad(psycho.hit)}`);
console.log(`  missed                ${pad(psycho.missed)}`);
console.log(`  false alarms          ${pad(psycho.falseAlarm)}`);

console.log(`\nSeverity concerns         ${pad(sev.inLabels)} in the labels`);
console.log(`  found                 ${pad(sev.hit)}`);
console.log(`  missed                ${pad(sev.missed)}`);
console.log(`  false alarms          ${pad(sev.falseAlarm)}`);

console.log('\nEvidence');
console.log(`  quote found in the source text, finding kept     ${pad(rows.length - dropped)}`);
console.log(`  quote not found, finding thrown away             ${pad(dropped)}`);

// The counts are small enough that one disagreement moves them a long way.
const smallest = Math.min(psycho.inLabels, sev.inLabels);
if (smallest > 0 && smallest < 10) {
  const oneMiss = Math.round(((smallest - 1) / smallest) * 100);
  console.log(
    `\nOnly ${smallest} incidents in the labels carry these, so a single miss would take` +
      `\n100% down to ${oneMiss}%. Read this as a direction, not a measurement.`,
  );
}

const disagreements = rows.filter(
  (r) =>
    r.predictedCategory !== r.expectedCategory ||
    (r.predictedPsychosocial ?? false) !== r.expectedPsychosocial ||
    (r.predictedSeverityConcern ?? false) !== r.expectedSeverityConcern,
);

console.log(`\nWhere the model and the labels disagree: ${disagreements.length} of ${rows.length}`);

for (const d of disagreements) {
  console.log(`\n${d.sourceIncidentId}  ${d.incidentDate}`);
  console.log(`  "${d.description.slice(0, 96)}${d.description.length > 96 ? '...' : ''}"`);
  if (d.predictedCategory !== d.expectedCategory) {
    console.log(`  category   label ${d.expectedCategory}  ->  model ${d.predictedCategory} (${d.categoryConfidence})`);
    console.log(`             model: ${d.categoryReasoning}`);
    console.log(`             label: ${d.labelRationale}`);
  }
  if ((d.predictedPsychosocial ?? false) !== d.expectedPsychosocial) {
    console.log(`  psychosocial  label ${d.expectedPsychosocial}  ->  model ${d.predictedPsychosocial}`);
  }
  if ((d.predictedSeverityConcern ?? false) !== d.expectedSeverityConcern) {
    console.log(`  severity   label ${d.expectedSeverityConcern}  ->  model ${d.predictedSeverityConcern} (${d.severityConfidence})`);
    console.log(`             model: ${d.severityReasoning}`);
  }
}

// Whether the model's own confidence tracks being right; if it does not, the
// number is decoration. Per task, because one average would hide a run that is
// perfect on category and wrong on severity.
const mean = (xs: (string | number | null)[]) =>
  xs.length ? xs.reduce((a: number, x) => a + Number(x ?? 0), 0) / xs.length : 0;

function sureness(what: string, right: typeof rows, wrong: typeof rows, pick: (r: (typeof rows)[number]) => string | number | null) {
  const show = (xs: typeof rows) => (xs.length ? mean(xs.map(pick)).toFixed(2) : '—');
  console.log(`\nHow sure the model said it was, ${what}`);
  console.log(`  when it agreed with the labels    ${show(right).padStart(4)}   (${right.length} cases)`);
  console.log(`  when it did not                   ${show(wrong).padStart(4)}   (${wrong.length} cases)`);
}

sureness(
  'picking a category',
  rows.filter((r) => r.predictedCategory === r.expectedCategory),
  rows.filter((r) => r.predictedCategory !== r.expectedCategory),
  (r) => r.categoryConfidence,
);

// Only the flags it raised: averaging the silent majority drowns them.
const raised = rows.filter((r) => r.predictedSeverityConcern);
sureness(
  'raising a severity concern',
  raised.filter((r) => r.expectedSeverityConcern),
  raised.filter((r) => !r.expectedSeverityConcern),
  (r) => r.severityConfidence,
);
