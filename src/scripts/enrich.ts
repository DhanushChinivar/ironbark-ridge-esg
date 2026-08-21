// Runs classification over every incident and persists the results. Offline:
// the API never calls a model at request time.
import { db } from '../db/client.js';
import { incident, incidentClassification, severityFlag } from '../db/schema.js';
import { classifyIncident, type IncidentForClassification } from '../ai/classify.js';
import { PROMPT_VERSION } from '../ai/prompt.js';
import { env } from '../env.js';

const rows: IncidentForClassification[] = await db
  .select({
    id: incident.id,
    sourceIncidentId: incident.sourceIncidentId,
    typeCode: incident.typeCode,
    severityRaw: incident.severityRaw,
    severityNormalised: incident.severityNormalised,
    description: incident.description,
  })
  .from(incident)
  .orderBy(incident.incidentDate);

if (!rows.length) throw new Error('No incidents found. Run "npm run ingest" first.');

// A re-run replaces the previous pass rather than adding to it.
await db.delete(incidentClassification);
await db.delete(severityFlag);

let grounded = 0;
let discarded = 0;
let psychosocial = 0;
let flagged = 0;

for (const row of rows) {
  const result = await classifyIncident(row);
  const a = result.assessment;

  if (result.rejections.includes('category')) {
    discarded += 1;
    console.warn(`  ${row.sourceIncidentId}: category quote not found in the description, discarded`);
  } else {
    await db.insert(incidentClassification).values({
      incidentId: row.id,
      category: a.category,
      isPsychosocial: a.isPsychosocial,
      confidence: a.categoryConfidence.toFixed(3),
      reasoning: a.categoryReasoning,
      evidenceQuote: a.categoryEvidenceQuote,
      model: result.model,
      promptVersion: PROMPT_VERSION,
    });
    grounded += 1;
    if (a.isPsychosocial) psychosocial += 1;
  }

  if (result.rejections.includes('severity')) {
    discarded += 1;
    console.warn(`  ${row.sourceIncidentId}: severity quote not found in the description, discarded`);
  } else {
    await db.insert(severityFlag).values({
      incidentId: row.id,
      recordedSeverity: row.severityNormalised,
      suggestedSeverity: a.suggestedSeverity,
      isInconsistent: a.severityInconsistent,
      confidence: a.severityConfidence.toFixed(3),
      reasoning: a.severityReasoning,
      evidenceQuote: a.severityEvidenceQuote,
      model: result.model,
      promptVersion: PROMPT_VERSION,
    });
    if (a.severityInconsistent) flagged += 1;
  }
}

console.log(`\nClassified ${rows.length} incidents with ${env.ANTHROPIC_MODEL} (${PROMPT_VERSION})`);
console.log(`  classifications stored   ${grounded}`);
console.log(`  psychosocial found       ${psychosocial}`);
console.log(`  severity flags raised    ${flagged}`);
console.log(`  discarded, quote unfound ${discarded}`);
