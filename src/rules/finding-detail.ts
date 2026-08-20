// Structured payloads for data_quality_finding.detail. Whatever a finding's
// message names in prose, it also carries here, so the report can be queried
// rather than read.
import { z } from 'zod';

/** Marks a number we are illustrating rather than measuring. */
const illustrative = z.object({
  value: z.number(),
  basis: z.string(),
  isIllustrative: z.literal(true),
});

export const meterIdGapDetail = z.object({
  missingMeterId: z.string(),
  observedRange: z.tuple([z.string(), z.string()]),
  presentMeters: z.array(z.string()),
  coverageMonthsEach: z.number().int(),
  // Deliberately not a plain number: we cannot measure the impact of a meter
  // that may never have existed, only indicate its likely scale.
  impactTco2e: illustrative,
});

export const monthGapDetail = z.object({
  dataset: z.string(),
  missingPeriods: z.array(z.string()),
  periodsExpected: z.number().int(),
  periodsPresent: z.number().int(),
});

export const unitScaleBreakDetail = z.object({
  meterId: z.string(),
  breakAtPeriod: z.string(),
  lastNormalReading: z.number(),
  firstBrokenReading: z.number(),
  multiplierApplied: z.number(),
  monthsAffected: z.number().int(),
  impactTco2e: z.number(),
});

export const duplicateDetail = z.object({
  businessKey: z.string(),
  duplicateOfSourceRowId: z.number().int(),
  fieldsCompared: z.array(z.string()),
});

export const severityResolutionDetail = z.object({
  rawSeverity: z.string(),
  resolvedTo: z.number().int().nullable(),
  resolvedFromIncidentIds: z.array(z.string()),
  sharedDescription: z.string(),
});

export const supplierMergeDetail = z.object({
  mergedIntoSourceRowId: z.number().int(),
  evidence: z.enum(['abn', 'name']),
  abn: z.string().nullable(),
  namesCompared: z.tuple([z.string(), z.string()]),
});

export type MeterIdGapDetail = z.infer<typeof meterIdGapDetail>;
export type MonthGapDetail = z.infer<typeof monthGapDetail>;
export type UnitScaleBreakDetail = z.infer<typeof unitScaleBreakDetail>;
export type DuplicateDetail = z.infer<typeof duplicateDetail>;
export type SeverityResolutionDetail = z.infer<typeof severityResolutionDetail>;
export type SupplierMergeDetail = z.infer<typeof supplierMergeDetail>;

/** Which payload shape belongs with which rule code. */
export const DETAIL_SCHEMAS = {
  ELEC_METER_ID_GAP: meterIdGapDetail,
  ELEC_UNIT_SCALE_BREAK: unitScaleBreakDetail,
  FUEL_MONTH_GAP: monthGapDetail,
  FUEL_EXACT_DUPLICATE: duplicateDetail,
  INC_SEVERITY_TEXTUAL: severityResolutionDetail,
  INC_SEVERITY_UNRESOLVED: severityResolutionDetail,
  SUP_DUPLICATE_ABN: supplierMergeDetail,
  SUP_DUPLICATE_NAME: supplierMergeDetail,
} as const;
