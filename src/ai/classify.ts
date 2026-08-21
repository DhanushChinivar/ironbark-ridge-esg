// Calls the model, validates what comes back, and checks every quote against the
// source text. A quote that is not an exact substring means the assessment it
// supports is discarded: the model may interpret the description, never add to it.
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { env, requireAnthropicKey } from '../env.js';
import {
  ACTIVE_PROMPT,
  ASSESSMENT_TOOL,
  buildUserMessage,
  resolvePrompt,
} from './prompt.js';

export interface IncidentForClassification {
  id: number;
  sourceIncidentId: string;
  typeCode: string | null;
  severityRaw: string;
  severityNormalised: number | null;
  description: string;
}

const assessmentSchema = z.object({
  category: z.enum([
    'vehicle',
    'equipment',
    'environmental',
    'dust_air_quality',
    'slip_trip_fall',
    'dropped_object',
    'psychosocial',
    'infrastructure',
  ]),
  isPsychosocial: z.boolean(),
  categoryConfidence: z.number().min(0).max(1),
  categoryReasoning: z.string().min(1),
  categoryEvidenceQuote: z.string().min(1),
  severityInconsistent: z.boolean(),
  suggestedSeverity: z.number().int().min(1).max(5).nullable(),
  severityConfidence: z.number().min(0).max(1),
  severityReasoning: z.string().min(1),
  severityEvidenceQuote: z.string().min(1),
});

export type Assessment = z.infer<typeof assessmentSchema>;

export interface ClassificationResult {
  incidentId: number;
  sourceIncidentId: string;
  assessment: Assessment;
  model: string;
  promptVersion: string;
  /** Populated when a quote failed the substring check. */
  rejections: string[];
}

const client = () => new Anthropic({ apiKey: requireAnthropicKey() });

export function isGrounded(quote: string, description: string): boolean {
  return description.includes(quote.trim());
}

export async function classifyIncident(
  incident: IncidentForClassification,
  promptVersion: string = ACTIVE_PROMPT,
): Promise<ClassificationResult> {
  const prompt = resolvePrompt(promptVersion);

  const response = await client().messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: 1024,
    system: prompt.system,
    messages: [{ role: 'user', content: buildUserMessage(incident) }],
    tools: [ASSESSMENT_TOOL],
    tool_choice: { type: 'tool', name: ASSESSMENT_TOOL.name },
  });

  const toolUse = response.content.find((c) => c.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error(`${incident.sourceIncidentId}: model returned no tool call`);
  }

  const parsed = assessmentSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`${incident.sourceIncidentId}: malformed assessment - ${issues}`);
  }

  const assessment = parsed.data;
  const rejections: string[] = [];

  if (!isGrounded(assessment.categoryEvidenceQuote, incident.description)) {
    rejections.push('category');
  }
  if (!isGrounded(assessment.severityEvidenceQuote, incident.description)) {
    rejections.push('severity');
  }

  return {
    incidentId: incident.id,
    sourceIncidentId: incident.sourceIncidentId,
    assessment,
    model: env.ANTHROPIC_MODEL,
    promptVersion: prompt.version,
    rejections,
  };
}
