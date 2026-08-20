// No self-references here, so a single pass is enough. The severity scale comes
// from the database and is handed to the rules layer as plain data.
import type { Tx } from '../db/client.js';
import { incident } from '../db/schema.js';
import type { LandedFile } from '../ingest/land.js';
import { applyIncidentRules, type RawIncidentRow } from '../rules/incidents.js';
import { writeFindings, type PromotionSummary } from './findings.js';
import { resolveSite, type ReferenceData } from './reference.js';

const DATASET = 'incident_register';

export async function promoteIncidents(
  tx: Tx,
  ingestionRunId: number,
  landed: LandedFile,
  ref: ReferenceData,
): Promise<PromotionSummary> {
  const rawRows: RawIncidentRow[] = landed.rows.map((r) => ({
    rowNumber: r.rowNumber,
    incident_id: r.raw.incident_id ?? '',
    incident_date: r.raw.incident_date ?? '',
    location: r.raw.location ?? '',
    type_code: r.raw.type_code ?? '',
    severity: r.raw.severity ?? '',
    description: r.raw.description ?? '',
  }));

  const { incidents, findings } = applyIncidentRules(rawRows, {
    severityScale: ref.severityScale,
  });

  const sourceRowIdByNumber = new Map(landed.rows.map((r) => [r.rowNumber, r.id]));

  const values = incidents.map((i) => {
    const sourceRowId = sourceRowIdByNumber.get(i.rowNumber);
    if (sourceRowId === undefined) throw new Error(`No source row for incident ${i.rowNumber}`);
    return {
      sourceRowId,
      sourceIncidentId: i.sourceIncidentId,
      incidentDate: i.incidentDate,
      incidentDateRaw: i.incidentDateRaw,
      location: i.location,
      siteId: resolveSite(ref, DATASET, i.location),
      typeCode: i.typeCode,
      severityRaw: i.severityRaw,
      severityNormalised: i.severityNormalised,
      description: i.description,
    };
  });

  const inserted = await tx.insert(incident).values(values).returning({ id: incident.id });

  if (inserted.length !== incidents.length) {
    throw new Error(`Promoted ${inserted.length} incidents from ${incidents.length} rows`);
  }

  return writeFindings(tx, ingestionRunId, landed, DATASET, findings);
}
