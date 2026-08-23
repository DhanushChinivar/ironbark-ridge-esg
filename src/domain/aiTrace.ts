// One classification taken apart. The dashboard shows what the model concluded;
// this shows how it got there: the instruction it was given, the record it read,
// what it returned, and the substring check that decided whether to keep it.
//
// The prompt text is not a paraphrase. It is the exact constant the enrichment
// job sent, so the page cannot describe a prompt that was never used.
import { sql } from 'drizzle-orm';
import type { Tx } from '../db/client.js';
import type { AiTrace } from '../contracts/index.js';
import { ACTIVE_PROMPT, ASSESSMENT_TOOL, buildUserMessage, resolvePrompt } from '../ai/prompt.js';
import { isGrounded } from '../ai/classify.js';

interface Row extends Record<string, unknown> {
  incident_id: number;
  source_incident_id: string;
  incident_date: string;
  description: string;
  type_code: string | null;
  severity_raw: string;
  severity_normalised: number | null;
  category: string;
  is_psychosocial: boolean;
  confidence: string | null;
  reasoning: string;
  evidence_quote: string;
  model: string;
  prompt_version: string;
  severity_inconsistent: boolean | null;
  suggested_severity: number | null;
  severity_reasoning: string | null;
}

export async function aiTrace(tx: Tx, incidentId: number | null): Promise<AiTrace | null> {
  const prompt = resolvePrompt(ACTIVE_PROMPT);

  // Findings first, so a page with no incident chosen opens on something worth
  // reading rather than on whichever row happens to be first.
  const listed = await tx.execute<{ incident_id: number; label: string }>(sql`
    select c.incident_id,
           i.source_incident_id || '  ' || to_char(i.incident_date, 'YYYY-MM-DD') as label
    from incident_classification c
    join incident i on i.id = c.incident_id
    where c.prompt_version = ${ACTIVE_PROMPT}
    order by c.is_psychosocial desc, i.incident_date
  `);

  const choices = listed.rows.map((r) => ({ incidentId: r.incident_id, label: r.label }));
  const wanted = incidentId ?? choices[0]?.incidentId;
  if (wanted === undefined) return null;

  const found = await tx.execute<Row>(sql`
    select i.id                                       as incident_id,
           i.source_incident_id,
           to_char(i.incident_date, 'YYYY-MM-DD')     as incident_date,
           i.description,
           i.type_code,
           i.severity_raw,
           i.severity_normalised,
           c.category,
           c.is_psychosocial,
           c.confidence,
           c.reasoning,
           c.evidence_quote,
           c.model,
           c.prompt_version,
           f.is_inconsistent                          as severity_inconsistent,
           f.suggested_severity,
           f.reasoning                                as severity_reasoning
    from incident_classification c
    join incident i on i.id = c.incident_id
    left join severity_flag f
      on f.incident_id = c.incident_id and f.prompt_version = c.prompt_version
    where c.incident_id = ${wanted} and c.prompt_version = ${ACTIVE_PROMPT}
  `);

  const r = found.rows[0];
  if (!r) return null;

  return {
    model: r.model,
    promptVersion: r.prompt_version,
    systemPrompt: prompt.system,
    userMessage: buildUserMessage({
      sourceIncidentId: r.source_incident_id,
      typeCode: r.type_code,
      severityRaw: r.severity_raw,
      severityNormalised: r.severity_normalised,
      description: r.description,
    }),
    outputFields: ASSESSMENT_TOOL.input_schema.required,
    incident: {
      incidentId: r.incident_id,
      sourceIncidentId: r.source_incident_id,
      incidentDate: r.incident_date,
      description: r.description,
      typeCode: r.type_code,
      severityRaw: r.severity_raw,
      recordedSeverity: r.severity_normalised,
    },
    assessment: {
      category: r.category,
      isPsychosocial: r.is_psychosocial,
      confidence: r.confidence === null ? null : Number(r.confidence),
      reasoning: r.reasoning,
      severityInconsistent: r.severity_inconsistent ?? false,
      suggestedSeverity: r.suggested_severity,
      severityReasoning: r.severity_reasoning,
    },
    // Re-run here rather than trusting the stored row. If the check ever stopped
    // passing, this page is where it would show.
    grounding: {
      quote: r.evidence_quote,
      found: isGrounded(r.evidence_quote, r.description),
      offset: r.description.indexOf(r.evidence_quote.trim()),
    },
    choices,
  };
}
