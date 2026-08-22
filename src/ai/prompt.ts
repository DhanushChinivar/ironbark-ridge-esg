// Two prompts differing only in whether the criteria are stated. Every stored
// result records which one produced it, so both can sit in the database and be
// compared. Why that comparison matters: docs/ai-evaluation.md.


export const CATEGORY_GUIDE = `
- vehicle: light vehicle and haul fleet interactions, speeding, reversing
- equipment: plant and machinery failure, maintenance injuries, pinch points
- environmental: spills, sheens, sediment, containment
- dust_air_quality: dust exceedances, respiratory irritation, RPE
- slip_trip_fall: slips, trips, falls from height
- dropped_object: objects falling from height
- psychosocial: see below
- infrastructure: utilities and site services failure`.trim();

const WITH_CRITERIA_SYSTEM = `
You classify safety incidents for a Queensland open-cut coal mine. Your output
goes into a compliance report, so a finding you cannot support from the text is
worse than no finding at all.

CATEGORIES

Pick the one hazard that caused the incident, not the consequence that followed.
A hydraulic hose failure that releases oil is equipment, because the hose failed.

${CATEGORY_GUIDE}

PSYCHOSOCIAL HAZARDS

Mark an incident psychosocial where the description names a hazard from
Queensland's Managing the risk of psychosocial hazards at work Code of Practice:

- job demands: sustained overtime, understaffing, fatigue from extended hours
- poor support: exclusion from information or decisions, lack of supervisory support
- poor organisational justice: adverse treatment after a safety report
- bullying, harassment or aggression: repeated verbal abuse, intimidation

Physical injury is not psychosocial, however distressing. Neither is one-off
operational stress with no named hazard.

The register has no psychosocial type code, so incidents of this kind are filed
under whatever code the reporter chose. Judge the description, not the code.

SEVERITY

Severity runs 1 to 5, ascending, where 1 is least severe. Flag an inconsistency
only where the recorded severity is 1 or 2 AND the description names either:
- medical treatment beyond first aid: sutures, surgery, hospital transport,
  fracture, or a recorded lost-time injury; or
- a persisting health effect: named anxiety, poor sleep, ongoing psychological harm.

Do not flag first aid alone, "no injury", or a hazard with no stated outcome.

EVIDENCE

Every judgement needs an evidenceQuote copied character for character from the
incident description. Do not paraphrase, correct spelling, or join fragments
with an ellipsis. A quote that is not an exact substring is discarded along with
the assessment it supports.
`.trim();


// Same task, same output contract, criteria withheld. The category enum stays,
// since removing it would make the two runs incomparable.
const NO_CRITERIA_SYSTEM = `
You classify safety incidents for a Queensland open-cut coal mine. Your output
goes into a compliance report, so a finding you cannot support from the text is
worse than no finding at all.

For each incident, choose the category that best fits it, decide whether it
describes a psychosocial hazard, and decide whether the recorded severity is
inconsistent with what the description says happened.

Use your own judgement of Queensland work health and safety practice. This
prompt deliberately does not define the categories, the criteria for a
psychosocial hazard, or the threshold for a severity concern.

EVIDENCE

Every judgement needs an evidenceQuote copied character for character from the
incident description. Do not paraphrase, correct spelling, or join fragments
with an ellipsis. A quote that is not an exact substring is discarded along with
the assessment it supports.
`.trim();

export const PROMPTS = {
  'with-criteria': { version: 'with-criteria', system: WITH_CRITERIA_SYSTEM },
  'no-criteria': { version: 'no-criteria', system: NO_CRITERIA_SYSTEM },
} as const;

export type PromptVersion = keyof typeof PROMPTS;

// What the API serves. An ablation run must not change this.
export const ACTIVE_PROMPT: PromptVersion = 'with-criteria';

export function resolvePrompt(version: string): (typeof PROMPTS)[PromptVersion] {
  const prompt = PROMPTS[version as PromptVersion];
  if (!prompt) {
    throw new Error(`Unknown prompt "${version}". Known: ${Object.keys(PROMPTS).join(', ')}`);
  }
  return prompt;
}

export function buildUserMessage(incident: {
  sourceIncidentId: string;
  typeCode: string | null;
  severityRaw: string;
  severityNormalised: number | null;
  description: string;
}): string {
  return [
    `Incident: ${incident.sourceIncidentId}`,
    `Recorded type code: ${incident.typeCode ?? 'none'}`,
    `Recorded severity: ${incident.severityRaw}` +
      (incident.severityNormalised === null
        ? ' (could not be resolved to a number)'
        : ` (normalised to ${incident.severityNormalised})`),
    `Description: ${incident.description}`,
  ].join('\n');
}

// A tool rather than "return JSON": the model cannot reply with anything else.
export const ASSESSMENT_TOOL = {
  name: 'record_assessment',
  description: 'Record the classification and severity assessment for one incident.',
  input_schema: {
    type: 'object' as const,
    properties: {
      category: {
        type: 'string',
        enum: [
          'vehicle',
          'equipment',
          'environmental',
          'dust_air_quality',
          'slip_trip_fall',
          'dropped_object',
          'psychosocial',
          'infrastructure',
        ],
      },
      isPsychosocial: { type: 'boolean' },
      categoryConfidence: { type: 'number', minimum: 0, maximum: 1 },
      categoryReasoning: { type: 'string' },
      categoryEvidenceQuote: {
        type: 'string',
        description: 'Exact substring of the description supporting the category.',
      },
      severityInconsistent: { type: 'boolean' },
      suggestedSeverity: {
        type: ['integer', 'null'],
        minimum: 1,
        maximum: 5,
        description: 'Only when severityInconsistent is true, otherwise null.',
      },
      severityConfidence: { type: 'number', minimum: 0, maximum: 1 },
      severityReasoning: { type: 'string' },
      severityEvidenceQuote: {
        type: 'string',
        description: 'Exact substring of the description supporting the severity judgement.',
      },
    },
    required: [
      'category',
      'isPsychosocial',
      'categoryConfidence',
      'categoryReasoning',
      'categoryEvidenceQuote',
      'severityInconsistent',
      'suggestedSeverity',
      'severityConfidence',
      'severityReasoning',
      'severityEvidenceQuote',
    ],
  },
};
