// Scores the classifier against the hand-written labels and prints every
// disagreement, so a reader can audit the labels rather than trust them.
//
//   npm run evaluate                          scores the prompt the dashboard reads
//   npm run evaluate -- --prompt=classify-v2  scores an ablation stored alongside it
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

const pct = (n: number, d: number) => (d === 0 ? 'n/a' : `${((n / d) * 100).toFixed(0)}%`);

function binary(actual: boolean[], expected: boolean[]) {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  actual.forEach((a, i) => {
    const e = expected[i]!;
    if (a && e) tp += 1;
    else if (a && !e) fp += 1;
    else if (!a && e) fn += 1;
    else tn += 1;
  });
  return { tp, fp, fn, tn };
}

const categoryHits = rows.filter((r) => r.predictedCategory === r.expectedCategory).length;
const psycho = binary(rows.map((r) => r.predictedPsychosocial ?? false), rows.map((r) => r.expectedPsychosocial));
const sev = binary(rows.map((r) => r.predictedSeverityConcern ?? false), rows.map((r) => r.expectedSeverityConcern));

console.log(`\nEvaluation: ${rows[0]?.model} / ${prompt.version}, n=${rows.length}\n`);
console.log(`  category accuracy        ${categoryHits}/${rows.length}  ${pct(categoryHits, rows.length)}`);
console.log(`  psychosocial recall      ${psycho.tp}/${psycho.tp + psycho.fn}  ${pct(psycho.tp, psycho.tp + psycho.fn)}`);
console.log(`  psychosocial precision   ${psycho.tp}/${psycho.tp + psycho.fp}  ${pct(psycho.tp, psycho.tp + psycho.fp)}`);
console.log(`  severity recall          ${sev.tp}/${sev.tp + sev.fn}  ${pct(sev.tp, sev.tp + sev.fn)}`);
console.log(`  severity precision       ${sev.tp}/${sev.tp + sev.fp}  ${pct(sev.tp, sev.tp + sev.fp)}`);

const disagreements = rows.filter(
  (r) =>
    r.predictedCategory !== r.expectedCategory ||
    (r.predictedPsychosocial ?? false) !== r.expectedPsychosocial ||
    (r.predictedSeverityConcern ?? false) !== r.expectedSeverityConcern,
);

console.log(`\n  disagreements            ${disagreements.length}/${rows.length}`);

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

// Whether the model's own confidence tracks correctness. If it does not, the
// number is decoration and should not be used to route anything. Reported per
// task, because the two are not interchangeable: a run can be perfect on
// category and wrong on severity, and one mean would hide it.
const mean = (xs: (string | number | null)[]) =>
  xs.length ? xs.reduce((a: number, x) => a + Number(x ?? 0), 0) / xs.length : 0;

function calibration(label: string, right: typeof rows, wrong: typeof rows, pick: (r: (typeof rows)[number]) => string | number | null) {
  console.log(`\n  ${label} confidence when right  ${mean(right.map(pick)).toFixed(3)}  (n=${right.length})`);
  console.log(`  ${label} confidence when wrong  ${wrong.length ? mean(wrong.map(pick)).toFixed(3) : 'n/a'}  (n=${wrong.length})`);
}

calibration(
  'category',
  rows.filter((r) => r.predictedCategory === r.expectedCategory),
  rows.filter((r) => r.predictedCategory !== r.expectedCategory),
  (r) => r.categoryConfidence,
);

// Only over the flags actually raised. Scoring the silent majority would drown
// the handful of judgements this number is meant to help triage.
const raised = rows.filter((r) => r.predictedSeverityConcern);
calibration(
  'severity flag',
  raised.filter((r) => r.expectedSeverityConcern),
  raised.filter((r) => !r.expectedSeverityConcern),
  (r) => r.severityConfidence,
);
