// Loads the hand-written ground truth into incident_label. Idempotent.
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { incident, incidentLabel } from '../db/schema.js';
import { CATEGORIES, INCIDENT_LABELS, LABELLED_BY } from '../ai/labels.js';

const incidents = await db
  .select({ id: incident.id, sourceIncidentId: incident.sourceIncidentId, incidentDate: incident.incidentDate })
  .from(incident);

if (incidents.length !== INCIDENT_LABELS.length) {
  throw new Error(`${incidents.length} incidents but ${INCIDENT_LABELS.length} labels: every incident must be labelled`);
}

// Keyed on id plus date, because INC-2025-011 names two different events.
const idByKey = new Map(incidents.map((i) => [`${i.sourceIncidentId}|${i.incidentDate}`, i.id]));

let written = 0;
for (const l of INCIDENT_LABELS) {
  if (!CATEGORIES.includes(l.expectedCategory as (typeof CATEGORIES)[number])) {
    throw new Error(`Unknown category "${l.expectedCategory}" on ${l.sourceIncidentId}`);
  }
  const incidentId = idByKey.get(`${l.sourceIncidentId}|${l.incidentDate}`);
  if (incidentId === undefined) {
    throw new Error(`No incident matches ${l.sourceIncidentId} on ${l.incidentDate}`);
  }
  const res = await db
    .insert(incidentLabel)
    .values({
      incidentId,
      expectedCategory: l.expectedCategory,
      isPsychosocial: l.isPsychosocial,
      severityConcern: l.severityConcern,
      rationale: l.rationale,
      labelledBy: LABELLED_BY,
    })
    .onConflictDoNothing()
    .returning({ id: incidentLabel.id });
  written += res.length;
}

const psychosocial = INCIDENT_LABELS.filter((l) => l.isPsychosocial).length;
const concerns = INCIDENT_LABELS.filter((l) => l.severityConcern).length;

console.log(`Ground truth for ${INCIDENT_LABELS.length} incidents (${written} new, ${INCIDENT_LABELS.length - written} already present)`);
console.log(`  psychosocial       ${psychosocial}`);
console.log(`  severity concerns  ${concerns}`);
