// Structured payloads for data_quality_finding.detail. Whatever a finding's
// message names in prose, it also carries here, so the report can be queried
// rather than read.
//
// Validated at write time: a payload that does not match its rule's shape stops
// the ingest rather than reaching the database, where a dashboard would later
// read a field that is not there.
import { z } from 'zod';

// Marks a number we are illustrating rather than measuring, so it cannot be
// mistaken for a computed figure by anything reading the payload.
const illustrative = z.object({
  value: z.number(),
  basis: z.string(),
  isIllustrative: z.literal(true),
});

export const meterIdGapDetail = z.object({
  missingMeterId: z.string(),
  observedRange: z.tuple([z.string(), z.string()]),
  presentMeters: z.array(z.string()),
  // A single number when every meter has the same coverage, otherwise the set
  // of distinct coverages found.
  coverageMonthsEach: z.union([z.number().int(), z.array(z.number().int())]),
  impactTco2e: illustrative,
});

export const unitScaleBreakDetail = z.object({
  meterId: z.string(),
  periodMonth: z.string(),
  multiplierApplied: z.number(),
  adjustmentId: z.number().int(),
});

export const siteUnmappedDetail = z.object({
  meterId: z.string(),
  meterDescription: z.string(),
  readingsAffected: z.number().int(),
});

export const monthGapDetail = z.object({
  dataset: z.string(),
  missingPeriods: z.array(z.string()),
  periodsExpected: z.number().int(),
  periodsPresent: z.number().int(),
});

export const headerWhitespaceDetail = z.object({
  headings: z.array(z.string()),
  trimmedTo: z.array(z.string()),
});

export const duplicateDetail = z.object({
  businessKey: z.string(),
  duplicateOfRowNumber: z.number().int(),
  fieldsCompared: z.array(z.string()),
});

export const creditNoteDetail = z.object({
  invoiceNo: z.string(),
  litres: z.number(),
  costAud: z.number().nullable(),
  costAndQuantityAgree: z.boolean(),
});

export const priceOutlierDetail = z.object({
  impliedPricePerLitre: z.number(),
  medianPricePerLitre: z.number(),
  deviationPercent: z.number(),
  tolerancePercent: z.number(),
});

export const monthPrecisionDetail = z.object({
  precision: z.literal('month'),
  datedToFirstOfMonth: z.literal(true),
});

export const unitConversionDetail = z.object({
  multiplier: z.number(),
});

export const severityResolutionDetail = z.object({
  rawSeverity: z.string(),
  resolvedTo: z.number().int().nullable(),
  sharedDescription: z.string(),
  resolvedFromIncidentIds: z.array(z.string()),
});

export const idCollisionDetail = z.object({
  incidentId: z.string(),
  rowNumbers: z.array(z.number().int()),
  dates: z.array(z.string()),
  descriptionsDiffer: z.boolean(),
});

export const supplierMergeDetail = z.object({
  mergedIntoRowNumber: z.number().int(),
  evidence: z.enum(['abn', 'name']),
  abn: z.string().nullable(),
  namesCompared: z.tuple([z.string(), z.string()]),
  normalisedTo: z.string().optional(),
});

export const abnFormatDetail = z.object({
  digitsFound: z.number().int(),
  digitsExpected: z.number().int(),
});

// Which payload shape belongs with which rule code. Rules absent from this map
// carry no structured detail, which is fine - not every finding has specifics
// worth indexing.
export const DETAIL_SCHEMAS = {
  ELEC_METER_ID_GAP: meterIdGapDetail,
  ELEC_UNIT_SCALE_BREAK: unitScaleBreakDetail,
  ELEC_SITE_UNMAPPED: siteUnmappedDetail,
  FUEL_MONTH_GAP: monthGapDetail,
  FUEL_HEADER_WHITESPACE: headerWhitespaceDetail,
  FUEL_EXACT_DUPLICATE: duplicateDetail,
  FUEL_CREDIT_NOTE: creditNoteDetail,
  FUEL_PRICE_OUTLIER: priceOutlierDetail,
  FUEL_DATE_MONTH_ONLY: monthPrecisionDetail,
  FUEL_UNIT_KL: unitConversionDetail,
  INC_SEVERITY_TEXTUAL: severityResolutionDetail,
  INC_SEVERITY_UNRESOLVED: severityResolutionDetail,
  INC_ID_COLLISION: idCollisionDetail,
  SUP_DUPLICATE_ABN: supplierMergeDetail,
  SUP_DUPLICATE_NAME: supplierMergeDetail,
  SUP_ABN_FORMAT: abnFormatDetail,
} as const;

export type DetailRuleCode = keyof typeof DETAIL_SCHEMAS;

// Returns the payload unchanged, or throws naming the rule and the problem.
export function validateDetail(ruleCode: string, detail: unknown): unknown {
  const schema = DETAIL_SCHEMAS[ruleCode as DetailRuleCode];
  if (!schema) return detail ?? null;

  const parsed = schema.safeParse(detail);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid detail payload for ${ruleCode}: ${issues}`);
  }
  return parsed.data;
}
