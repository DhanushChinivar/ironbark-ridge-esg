// Classifies every incident and stores the result. Offline: the API never calls
// a model at request time.
//
//   npm run enrich                          the prompt the dashboard reads
//   npm run enrich -- --prompt=no-criteria  an ablation, stored alongside it
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { incident, incidentClassification, severityFlag } from '../db/schema.js';
import { classifyIncident, type IncidentForClassification } from '../ai/classify.js';
import { ACTIVE_PROMPT, resolvePrompt } from '../ai/prompt.js';
import { env } from '../env.js';

const requested = process.argv.find((a) => a.startsWith('--prompt='))?.split('=')[1];
const prompt = resolvePrompt(requested ?? ACTIVE_PROMPT);

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

// Replaces this prompt's previous pass and leaves other versions alone, which
// is what lets two passes coexist rather than overwrite each other.
await db.delete(incidentClassification).where(eq(incidentClassification.promptVersion, prompt.version));
await db.delete(severityFlag).where(eq(severityFlag.promptVersion, prompt.version));

let grounded = 0;
let discarded = 0;
let psychosocial = 0;
let flagged = 0;

for (const row of rows) {
  const result = await classifyIncident(row, prompt.version);
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
      promptVersion: prompt.version,
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
      promptVersion: prompt.version,
    });
    if (a.severityInconsistent) flagged += 1;
  }
}

console.log(`\nClassified ${rows.length} incidents with ${env.ANTHROPIC_MODEL} (${prompt.version})`);
console.log(`  classifications stored   ${grounded}`);
console.log(`  psychosocial found       ${psychosocial}`);
console.log(`  severity flags raised    ${flagged}`);
console.log(`  discarded, quote unfound ${discarded}`);
