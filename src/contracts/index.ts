// Response shapes, shared by the API and the frontend. The API validates against
// these before responding, so drift breaks the build and not the dashboard.
import { z } from 'zod';

export const basisSchema = z.enum(['corrected', 'as_reported']);
export type Basis = z.infer<typeof basisSchema>;

export const monthlyEmissionsRowSchema = z.object({
  month: z.string(),
  scope1Tco2e: z.number(),
  scope2Tco2e: z.number(),
  totalTco2e: z.number(),
  fuelDeliveries: z.number().int(),
  meterReadings: z.number().int(),
  // A zero with no data behind it means "unknown", not "nothing was burned".
  hasFuelData: z.boolean(),
  hasElectricityData: z.boolean(),
});

export const monthlyEmissionsSchema = z.object({
  basis: basisSchema,
  months: z.array(monthlyEmissionsRowSchema),
  totals: z.object({
    scope1Tco2e: z.number(),
    scope2Tco2e: z.number(),
    totalTco2e: z.number(),
  }),
  // What our corrections are worth, so the number is visible rather than folded in.
  correction: z.object({
    scope2AsReportedTco2e: z.number(),
    scope2CorrectedTco2e: z.number(),
    differenceTco2e: z.number(),
  }),
  monthsWithoutFuelData: z.array(z.string()),
});

// The arithmetic behind one month, line by line. Every field a reader needs to
// redo the sum by hand is here, including the ones that were excluded and why.
const calculationLineSchema = z.object({
  sourceFile: z.string(),
  sourceRowNumber: z.number().int(),
  reference: z.string(),
  asRecorded: z.string(),
  quantity: z.number(),
  quantityUnit: z.string(),
  factorActivity: z.string(),
  factorPerUnit: z.number(),
  kgCo2e: z.number(),
  /** True where cleaning changed the quantity: a unit conversion or a rescale. */
  changed: z.boolean(),
  /** Present when the line is shown but deliberately left out of the sum. */
  excludedBecause: z.string().nullable(),
  /** Present when the line counts, but needs saying why it reads oddly. */
  note: z.string().nullable(),
});

export const emissionsCalculationSchema = z.object({
  month: z.string(),
  basis: basisSchema,
  scopes: z.array(
    z.object({
      scope: z.number().int(),
      label: z.string(),
      lines: z.array(calculationLineSchema),
      countedLines: z.number().int(),
      subtotalKgCo2e: z.number(),
      subtotalTco2e: z.number(),
    }),
  ),
  totalTco2e: z.number(),
  // The same month as the dashboard reports it. If these disagree, one of the
  // two queries is wrong and the page says so rather than hiding it.
  reported: z.object({
    scope1Tco2e: z.number(),
    scope2Tco2e: z.number(),
    totalTco2e: z.number(),
  }),
  availableMonths: z.array(z.string()),
});

// Fifteen supplier rows resolved to thirteen companies. Each merge states the
// evidence behind it, because "same ABN" and "similar name" are not the same
// claim and should not be presented as though they were.
export const supplierResolutionSchema = z.object({
  rowsRead: z.number().int(),
  companies: z.array(
    z.object({
      supplierId: z.number().int(),
      sourceRowNumber: z.number().int(),
      name: z.string(),
      abn: z.string().nullable(),
      abnFormatValid: z.boolean().nullable(),
      category: z.string().nullable(),
      ownSpendAud: z.number().nullable(),
      /** Own spend plus every row merged into it. */
      totalSpendAud: z.number(),
      mergedFrom: z.array(
        z.object({
          sourceRowNumber: z.number().int(),
          name: z.string(),
          abn: z.string().nullable(),
          spendAud: z.number().nullable(),
          matchMethod: z.string(),
          /** True only for an ABN match. A name match is an inference. */
          proven: z.boolean(),
          /** The category this row carried, where it differed from the one kept. */
          discardedCategory: z.string().nullable(),
        }),
      ),
    }),
  ),
  totals: z.object({
    companies: z.number().int(),
    merged: z.number().int(),
    provenMerges: z.number().int(),
    inferredMerges: z.number().int(),
    missingAbn: z.number().int(),
    invalidAbn: z.number().int(),
  }),
});

export const incidentSummarySchema = z.object({
  total: z.number().int(),
  bySeverity: z.array(
    z.object({ severity: z.number().int().nullable(), count: z.number().int() }),
  ),
  byType: z.array(z.object({ typeCode: z.string().nullable(), count: z.number().int() })),
  bySite: z.array(z.object({ site: z.string().nullable(), count: z.number().int() })),
  unresolvedSeverity: z.number().int(),
});

export const incidentTrendSchema = z.object({
  months: z.array(
    z.object({
      month: z.string(),
      total: z.number().int(),
      bySeverity: z.record(z.string(), z.number().int()),
      byType: z.record(z.string(), z.number().int()),
    }),
  ),
});

export const dataQualityFindingSchema = z.object({
  id: z.number().int(),
  ruleCode: z.string(),
  dataset: z.string(),
  severity: z.enum(['info', 'warning', 'critical']),
  action: z.enum(['fixed', 'flagged', 'rejected']),
  message: z.string(),
  rationale: z.string(),
  field: z.string().nullable(),
  originalValue: z.string().nullable(),
  correctedValue: z.string().nullable(),
  detail: z.unknown().nullable(),
  sourceRowId: z.number().int().nullable(),
  sourceRowNumber: z.number().int().nullable(),
});

export const dataQualityReportSchema = z.object({
  files: z.array(
    z.object({
      fileName: z.string(),
      contentHash: z.string(),
      rowsRead: z.number().int(),
      rowsPromoted: z.number().int(),
      rowsFlagged: z.number().int(),
      rowsRejected: z.number().int(),
    }),
  ),
  byRule: z.array(
    z.object({
      ruleCode: z.string(),
      dataset: z.string(),
      action: z.enum(['fixed', 'flagged', 'rejected']),
      severity: z.enum(['info', 'warning', 'critical']),
      count: z.number().int(),
      message: z.string(),
      rationale: z.string(),
    }),
  ),
  findings: z.array(dataQualityFindingSchema),
  totals: z.object({
    findings: z.number().int(),
    fixed: z.number().int(),
    flagged: z.number().int(),
    rejected: z.number().int(),
  }),
});

export const aiFindingSchema = z.object({
  incidentId: z.number().int(),
  sourceIncidentId: z.string(),
  incidentDate: z.string(),
  description: z.string(),
  typeCode: z.string().nullable(),
  recordedSeverity: z.number().int().nullable(),
  category: z.string(),
  isPsychosocial: z.boolean(),
  categoryConfidence: z.number().nullable(),
  categoryReasoning: z.string(),
  categoryEvidenceQuote: z.string(),
  severityInconsistent: z.boolean(),
  suggestedSeverity: z.number().int().nullable(),
  severityReasoning: z.string().nullable(),
  severityEvidenceQuote: z.string().nullable(),
  model: z.string(),
  promptVersion: z.string(),
});

export const aiFindingsSchema = z.object({
  model: z.string().nullable(),
  promptVersion: z.string().nullable(),
  totals: z.object({
    classified: z.number().int(),
    psychosocial: z.number().int(),
    severityInconsistent: z.number().int(),
  }),
  findings: z.array(aiFindingSchema),
});

// One classification, taken apart: what the model was told, what it was given,
// what it returned, and the check that decided whether to keep it.
export const aiTraceSchema = z.object({
  model: z.string(),
  promptVersion: z.string(),
  systemPrompt: z.string(),
  userMessage: z.string(),
  outputFields: z.array(z.string()),
  incident: z.object({
    incidentId: z.number().int(),
    sourceIncidentId: z.string(),
    incidentDate: z.string(),
    description: z.string(),
    typeCode: z.string().nullable(),
    severityRaw: z.string(),
    recordedSeverity: z.number().int().nullable(),
  }),
  assessment: z.object({
    category: z.string(),
    isPsychosocial: z.boolean(),
    confidence: z.number().nullable(),
    reasoning: z.string(),
    severityInconsistent: z.boolean(),
    suggestedSeverity: z.number().int().nullable(),
    severityReasoning: z.string().nullable(),
  }),
  // The check that decides whether a finding is kept. offset is where the quote
  // starts in the description, so the page can show it in place.
  grounding: z.object({
    quote: z.string(),
    found: z.boolean(),
    offset: z.number().int(),
  }),
  choices: z.array(z.object({ incidentId: z.number().int(), label: z.string() })),
});

export const evidenceSchema = z.object({
  sourceRowId: z.number().int(),
  fileName: z.string(),
  rowNumber: z.number().int(),
  raw: z.record(z.string(), z.string()),
  disposition: z.enum(['promoted', 'rejected']),
  findings: z.array(dataQualityFindingSchema),
});

export type MonthlyEmissions = z.infer<typeof monthlyEmissionsSchema>;
export type EmissionsCalculation = z.infer<typeof emissionsCalculationSchema>;
export type CalculationLine = z.infer<typeof calculationLineSchema>;
export type SupplierResolution = z.infer<typeof supplierResolutionSchema>;
export type IncidentSummary = z.infer<typeof incidentSummarySchema>;
export type IncidentTrend = z.infer<typeof incidentTrendSchema>;
export type DataQualityReport = z.infer<typeof dataQualityReportSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type AiTrace = z.infer<typeof aiTraceSchema>;
export type AiFindings = z.infer<typeof aiFindingsSchema>;
export type AiFinding = z.infer<typeof aiFindingSchema>;
