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

export const incidentSummarySchema = z.object({
  total: z.number().int(),
  bySeverity: z.array(
    z.object({ severity: z.number().int().nullable(), count: z.number().int() }),
  ),
  byType: z.array(z.object({ typeCode: z.string(), count: z.number().int() })),
  bySite: z.array(z.object({ site: z.string().nullable(), count: z.number().int() })),
  unresolvedSeverity: z.number().int(),
});

export const incidentTrendSchema = z.object({
  months: z.array(
    z.object({
      month: z.string(),
      total: z.number().int(),
      bySeverity: z.record(z.string(), z.number().int()),
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

export const evidenceSchema = z.object({
  sourceRowId: z.number().int(),
  fileName: z.string(),
  rowNumber: z.number().int(),
  raw: z.record(z.string(), z.string()),
  disposition: z.enum(['promoted', 'rejected']),
  findings: z.array(dataQualityFindingSchema),
});

export type MonthlyEmissions = z.infer<typeof monthlyEmissionsSchema>;
export type IncidentSummary = z.infer<typeof incidentSummarySchema>;
export type IncidentTrend = z.infer<typeof incidentTrendSchema>;
export type DataQualityReport = z.infer<typeof dataQualityReportSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
