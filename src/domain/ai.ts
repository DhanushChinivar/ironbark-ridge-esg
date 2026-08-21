// Model output joined back to the incidents it describes. Read only: the
// classifications were written offline by npm run enrich.
import { sql } from 'drizzle-orm';
import type { Tx } from '../db/client.js';
import type { AiFindings } from '../contracts/index.js';

interface Row extends Record<string, unknown> {
  incident_id: number;
  source_incident_id: string;
  incident_date: string;
  description: string;
  type_code: string | null;
  recorded_severity: number | null;
  category: string;
  is_psychosocial: boolean;
  category_confidence: string | null;
  category_reasoning: string;
  category_quote: string;
  severity_inconsistent: boolean | null;
  suggested_severity: number | null;
  severity_reasoning: string | null;
  severity_quote: string | null;
  model: string;
  prompt_version: string;
}

export async function aiFindings(tx: Tx): Promise<AiFindings> {
  const result = await tx.execute<Row>(sql`
    select i.id                       as incident_id,
           i.source_incident_id,
           to_char(i.incident_date, 'YYYY-MM-DD') as incident_date,
           i.description,
           i.type_code,
           i.severity_normalised      as recorded_severity,
           c.category,
           c.is_psychosocial,
           c.confidence               as category_confidence,
           c.reasoning                as category_reasoning,
           c.evidence_quote           as category_quote,
           f.is_inconsistent          as severity_inconsistent,
           f.suggested_severity,
           f.reasoning                as severity_reasoning,
           f.evidence_quote           as severity_quote,
           c.model,
           c.prompt_version
    from incident_classification c
    join incident i on i.id = c.incident_id
    left join severity_flag f on f.incident_id = c.incident_id
    order by i.incident_date
  `);

  const findings = result.rows.map((r) => ({
    incidentId: r.incident_id,
    sourceIncidentId: r.source_incident_id,
    incidentDate: r.incident_date,
    description: r.description,
    typeCode: r.type_code,
    recordedSeverity: r.recorded_severity,
    category: r.category,
    isPsychosocial: r.is_psychosocial,
    categoryConfidence: r.category_confidence === null ? null : Number(r.category_confidence),
    categoryReasoning: r.category_reasoning,
    categoryEvidenceQuote: r.category_quote,
    severityInconsistent: r.severity_inconsistent ?? false,
    suggestedSeverity: r.suggested_severity,
    severityReasoning: r.severity_reasoning,
    severityEvidenceQuote: r.severity_quote,
    model: r.model,
    promptVersion: r.prompt_version,
  }));

  return {
    model: findings[0]?.model ?? null,
    promptVersion: findings[0]?.promptVersion ?? null,
    totals: {
      classified: findings.length,
      psychosocial: findings.filter((f) => f.isPsychosocial).length,
      severityInconsistent: findings.filter((f) => f.severityInconsistent).length,
    },
    findings,
  };
}
