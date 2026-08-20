// Raw CSV rows land in source_row and are never edited. Cleaning promotes a
// corrected copy into a typed table and records what it changed as a finding.
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

// A row either made it into a typed table or it did not. Whether it carried a
// concern is a separate fact, recorded per finding rather than per row — a row
// whose kL was converted to litres is cleanly promoted and not flagged at all.
export const dispositionEnum = pgEnum('disposition', ['promoted', 'rejected']);

export const findingActionEnum = pgEnum('finding_action', ['fixed', 'flagged', 'rejected']);

export const findingSeverityEnum = pgEnum('finding_severity', ['info', 'warning', 'critical']);

// Mon-YY fuel dates carry no day, so precision is tracked rather than guessed.
export const datePrecisionEnum = pgEnum('date_precision', ['day', 'month']);

export const supplierMatchEnum = pgEnum('supplier_match_method', ['abn', 'name']);

export const runStatusEnum = pgEnum('run_status', ['running', 'succeeded', 'failed']);

// How confidently a raw location label was resolved to a site.
export const matchConfidenceEnum = pgEnum('match_confidence', ['exact', 'inferred', 'unmapped']);

export const ingestionRun = pgTable('ingestion_run', {
  id: serial('id').primaryKey(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  status: runStatusEnum('status').notNull().default('running'),
  notes: text('notes'),
});

export const sourceFile = pgTable(
  'source_file',
  {
    id: serial('id').primaryKey(),
    ingestionRunId: integer('ingestion_run_id')
      .notNull()
      .references(() => ingestionRun.id, { onDelete: 'cascade' }),
    fileName: text('file_name').notNull(),
    // sha256 of the file bytes, so a run can prove which version it read.
    contentHash: text('content_hash').notNull(),
    rowsRead: integer('rows_read').notNull().default(0),
    rowsPromoted: integer('rows_promoted').notNull().default(0),
    // Promoted rows carrying at least one flagged finding.
    rowsFlagged: integer('rows_flagged').notNull().default(0),
    rowsRejected: integer('rows_rejected').notNull().default(0),
  },
  (t) => [
    uniqueIndex('source_file_run_name_uq').on(t.ingestionRunId, t.fileName),
    // Nothing can go missing without violating this.
    check('source_file_rows_balance', sql`${t.rowsRead} = ${t.rowsPromoted} + ${t.rowsRejected}`),
    // Flagged rows are promoted rows carrying at least one flagged finding, so
    // the count is a subset rather than a fourth outcome.
    check('source_file_flagged_subset', sql`${t.rowsFlagged} <= ${t.rowsPromoted}`),
  ],
);

// Verbatim CSV lines. Only `disposition` is ever updated.
//
// Each promoted table carries a unique index on source_row_id: one CSV line
// promotes to exactly one domain row. Without it an interrupted-and-rerun
// ingest could double-promote, inflating every total while the row counters
// still balanced.
export const sourceRow = pgTable(
  'source_row',
  {
    id: serial('id').primaryKey(),
    sourceFileId: integer('source_file_id')
      .notNull()
      .references(() => sourceFile.id, { onDelete: 'cascade' }),
    // 1-based excluding the header, so it lines up with what a human sees in Excel.
    rowNumber: integer('row_number').notNull(),
    raw: jsonb('raw').notNull(),
    // sha256 of the canonicalised cells; how exact duplicates are found.
    rowHash: text('row_hash').notNull(),
    disposition: dispositionEnum('disposition').notNull().default('promoted'),
  },
  (t) => [
    uniqueIndex('source_row_file_number_uq').on(t.sourceFileId, t.rowNumber),
    index('source_row_hash_idx').on(t.rowHash),
  ],
);

// activityKey is a stable join key so nothing has to string-match a display label.
export const emissionFactor = pgTable(
  'emission_factor',
  {
    id: serial('id').primaryKey(),
    activityKey: text('activity_key').notNull(),
    activity: text('activity').notNull(),
    scope: smallint('scope').notNull(),
    unit: text('unit').notNull(),
    kgCo2ePerUnit: numeric('kg_co2e_per_unit', { precision: 12, scale: 4 }).notNull(),
    source: text('source').notNull(),
  },
  (t) => [
    uniqueIndex('emission_factor_activity_key_uq').on(t.activityKey),
    check('emission_factor_scope_valid', sql`${t.scope} in (1, 2, 3)`),
    check('emission_factor_positive', sql`${t.kgCo2ePerUnit} > 0`),
  ],
);

// Severity is recorded as both 1/2/3 and Low/Medium. The mapping lives in the
// database rather than in code so the assumption stays visible and queryable.
export const severityScale = pgTable('severity_scale', {
  rawValue: text('raw_value').primaryKey(),
  normalised: smallint('normalised').notNull(),
  note: text('note'),
});

// Fuel and incidents share an identical set of six location labels, so those
// map exactly. The meters describe systems rather than places (CHPP Conveyors,
// Ventilation & Dewatering), and five of the six resolve to nothing.
export const site = pgTable(
  'site',
  {
    id: serial('id').primaryKey(),
    canonicalName: text('canonical_name').notNull(),
    description: text('description'),
  },
  (t) => [uniqueIndex('site_canonical_name_uq').on(t.canonicalName)],
);

export const siteAlias = pgTable(
  'site_alias',
  {
    id: serial('id').primaryKey(),
    dataset: text('dataset').notNull(),
    rawLabel: text('raw_label').notNull(),
    siteId: integer('site_id').references(() => site.id),
    matchConfidence: matchConfidenceEnum('match_confidence').notNull(),
    // Why a label was left unmapped, so the omission is a documented decision.
    note: text('note'),
  },
  (t) => [
    uniqueIndex('site_alias_dataset_label_uq').on(t.dataset, t.rawLabel),
    // Unmapped means no site, and a mapped alias must have one. Prevents an
    // alias claiming a confidence it cannot support.
    check(
      'site_alias_unmapped_has_no_site',
      sql`(${t.matchConfidence} = 'unmapped') = (${t.siteId} is null)`,
    ),
  ],
);

// Every month in the reporting window, so gaps render as "no data" rather than
// disappearing from a GROUP BY. November 2025 has no fuel deliveries at all.
export const reportPeriod = pgTable(
  'report_period',
  {
    periodMonth: date('period_month').primaryKey(),
  },
  (t) => [check('report_period_is_month_start', sql`extract(day from ${t.periodMonth}) = 1`)],
);

export const supplier = pgTable(
  'supplier',
  {
  id: serial('id').primaryKey(),
  sourceRowId: integer('source_row_id')
    .notNull()
    .references(() => sourceRow.id, { onDelete: 'cascade' }),
  nameRaw: text('name_raw').notNull(),
  nameNormalised: text('name_normalised').notNull(),
  abnRaw: text('abn_raw'),
  // Digits only; null when blank or not 11 digits.
  abnDigits: text('abn_digits'),
  // Format only: 11 digits present. Nothing here runs the modulus-89 checksum.
  abnFormatValid: boolean('abn_format_valid'),
  categoryRaw: text('category_raw'),
  categoryNormalised: text('category_normalised'),
  fySpendAud: numeric('fy_spend_aud', { precision: 14, scale: 2 }),
  // Null when this row is itself canonical. Blackwood's duplicate is provable by
  // a shared ABN; Ironline's P/L row has none, so matchMethod records how strong
  // the evidence actually was.
  canonicalSupplierId: integer('canonical_supplier_id').references((): AnyPgColumn => supplier.id),
  matchMethod: supplierMatchEnum('match_method'),
  },
  (t) => [uniqueIndex('supplier_source_row_uq').on(t.sourceRowId)],
);

export const fuelDelivery = pgTable(
  'fuel_delivery',
  {
    id: serial('id').primaryKey(),
    sourceRowId: integer('source_row_id')
      .notNull()
      .references(() => sourceRow.id, { onDelete: 'cascade' }),
    invoiceNo: text('invoice_no').notNull(),
    // For Mon-YY values this is the first of the month; see datePrecision.
    deliveryDate: date('delivery_date').notNull(),
    deliveryDateRaw: text('delivery_date_raw').notNull(),
    datePrecision: datePrecisionEnum('date_precision').notNull(),
    fuelTypeRaw: text('fuel_type_raw').notNull(),
    fuelTypeNormalised: text('fuel_type_normalised').notNull(),
    quantityAsRecorded: numeric('quantity_as_recorded', { precision: 14, scale: 3 }).notNull(),
    unitAsRecorded: text('unit_as_recorded').notNull(),
    // Canonical litres. kL rows are converted here, never in the raw table.
    quantityLitres: numeric('quantity_litres', { precision: 14, scale: 3 }).notNull(),
    costAud: numeric('cost_aud', { precision: 14, scale: 2 }),
    siteArea: text('site_area'),
    siteId: integer('site_id').references(() => site.id),
    // Which factor row was applied, so the calculation stays reproducible
    // even if a factor is later corrected. Null when unresolved, plus a finding.
    emissionFactorId: integer('emission_factor_id').references(() => emissionFactor.id),
    // Negative deliveries are credit notes reversing an over-delivery, not errors.
    isCreditNote: boolean('is_credit_note').notNull().default(false),
    // Set on the later copy of an exact duplicate; excluded from totals.
    duplicateOfId: integer('duplicate_of_id').references((): AnyPgColumn => fuelDelivery.id),
  },
  (t) => [
    uniqueIndex('fuel_delivery_source_row_uq').on(t.sourceRowId),
    index('fuel_delivery_date_idx').on(t.deliveryDate),
    index('fuel_delivery_invoice_idx').on(t.invoiceNo),
    // `<> 0` rather than `> 0`: INV-41777 is a credit note, and rejecting it
    // would overstate Scope 1 by 12,500 L of diesel.
    check('fuel_delivery_quantity_nonzero', sql`${t.quantityLitres} <> 0`),
    check(
      'fuel_delivery_negative_is_credit',
      sql`${t.quantityLitres} > 0 or ${t.isCreditNote} = true`,
    ),
  ],
);

// Corrections live here rather than on the readings, so as-reported and
// corrected figures can both be shown. MTR-07 switches to MWh from 2025-10
// while still labelled kWh.
export const meterAdjustment = pgTable('meter_adjustment', {
  id: serial('id').primaryKey(),
  meterId: text('meter_id').notNull(),
  effectiveFrom: date('effective_from').notNull(),
  effectiveTo: date('effective_to'),
  multiplier: numeric('multiplier', { precision: 12, scale: 4 }).notNull(),
  reason: text('reason').notNull(),
  evidence: text('evidence').notNull(),
}, (t) => [
  check('meter_adjustment_multiplier_positive', sql`${t.multiplier} > 0`),
  check(
    'meter_adjustment_period_ordered',
    sql`${t.effectiveTo} is null or ${t.effectiveTo} > ${t.effectiveFrom}`,
  ),
]);

export const electricityReading = pgTable(
  'electricity_reading',
  {
    id: serial('id').primaryKey(),
    sourceRowId: integer('source_row_id')
      .notNull()
      .references(() => sourceRow.id, { onDelete: 'cascade' }),
    meterId: text('meter_id').notNull(),
    meterDescription: text('meter_description'),
    periodMonth: date('period_month').notNull(),
    consumptionAsRecorded: numeric('consumption_as_recorded', { precision: 16, scale: 3 }).notNull(),
    unitAsRecorded: text('unit_as_recorded').notNull(),
    // Canonical kWh, after any meter adjustment.
    consumptionKwh: numeric('consumption_kwh', { precision: 16, scale: 3 }).notNull(),
    appliedAdjustmentId: integer('applied_adjustment_id').references(() => meterAdjustment.id),
    siteId: integer('site_id').references(() => site.id),
    emissionFactorId: integer('emission_factor_id').references(() => emissionFactor.id),
  },
  (t) => [
    uniqueIndex('electricity_reading_source_row_uq').on(t.sourceRowId),
    uniqueIndex('electricity_reading_meter_period_uq').on(t.meterId, t.periodMonth),
    index('electricity_reading_period_idx').on(t.periodMonth),
    // No credit-note equivalent for electricity, so unlike fuel this really is >= 0.
    check('electricity_reading_nonnegative', sql`${t.consumptionKwh} >= 0`),
  ],
);

export const incident = pgTable(
  'incident',
  {
    id: serial('id').primaryKey(),
    sourceRowId: integer('source_row_id')
      .notNull()
      .references(() => sourceRow.id, { onDelete: 'cascade' }),
    // Not unique: INC-2025-011 is reused for two different events.
    sourceIncidentId: text('source_incident_id').notNull(),
    incidentDate: date('incident_date').notNull(),
    incidentDateRaw: text('incident_date_raw').notNull(),
    location: text('location'),
    siteId: integer('site_id').references(() => site.id),
    typeCode: text('type_code'),
    severityRaw: text('severity_raw').notNull(),
    severityNormalised: smallint('severity_normalised'),
    description: text('description').notNull(),
  },
  (t) => [
    uniqueIndex('incident_source_row_uq').on(t.sourceRowId),
    index('incident_source_id_idx').on(t.sourceIncidentId),
    index('incident_date_idx').on(t.incidentDate),
    // An unmappable severity stays null and gets flagged, rather than being
    // coerced into a number we cannot defend.
    check(
      'incident_severity_range',
      sql`${t.severityNormalised} is null or ${t.severityNormalised} between 1 and 5`,
    ),
  ],
);

export const dataQualityFinding = pgTable(
  'data_quality_finding',
  {
    id: serial('id').primaryKey(),
    ingestionRunId: integer('ingestion_run_id')
      .notNull()
      .references(() => ingestionRun.id, { onDelete: 'cascade' }),
    // Stable code from the rule catalogue, e.g. FUEL_UNIT_KL.
    ruleCode: text('rule_code').notNull(),
    severity: findingSeverityEnum('severity').notNull(),
    action: findingActionEnum('action').notNull(),
    dataset: text('dataset').notNull(),
    sourceRowId: integer('source_row_id').references(() => sourceRow.id, { onDelete: 'cascade' }),
    field: text('field'),
    originalValue: text('original_value'),
    correctedValue: text('corrected_value'),
    message: text('message').notNull(),
    // Why this action, not one of the other two.
    rationale: text('rationale').notNull(),
    detail: jsonb('detail'),
  },
  (t) => [
    index('dq_finding_run_idx').on(t.ingestionRunId),
    index('dq_finding_rule_idx').on(t.ruleCode),
    index('dq_finding_row_idx').on(t.sourceRowId),
  ],
);

// Ground truth for all 42 incidents, labelled by hand before any prompt exists.
// Committed first on purpose: the labels cannot have been fitted to the output.
export const incidentLabel = pgTable(
  'incident_label',
  {
    id: serial('id').primaryKey(),
    incidentId: integer('incident_id')
      .notNull()
      .references(() => incident.id, { onDelete: 'cascade' }),
    expectedCategory: text('expected_category').notNull(),
    isPsychosocial: boolean('is_psychosocial').notNull(),
    severityConcern: boolean('severity_concern').notNull(),
    rationale: text('rationale'),
    labelledBy: text('labelled_by').notNull(),
    labelledAt: timestamp('labelled_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('incident_label_incident_uq').on(t.incidentId)],
);

export const incidentClassification = pgTable(
  'incident_classification',
  {
    id: serial('id').primaryKey(),
    incidentId: integer('incident_id')
      .notNull()
      .references(() => incident.id, { onDelete: 'cascade' }),
    category: text('category').notNull(),
    isPsychosocial: boolean('is_psychosocial').notNull(),
    confidence: numeric('confidence', { precision: 4, scale: 3 }),
    reasoning: text('reasoning').notNull(),
    // Must be an exact substring of the description. If it isn't, the whole
    // classification is rejected: the model may interpret, never assert.
    evidenceQuote: text('evidence_quote').notNull(),
    model: text('model').notNull(),
    promptVersion: text('prompt_version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('incident_classification_incident_idx').on(t.incidentId),
    check(
      'incident_classification_confidence_range',
      sql`${t.confidence} is null or ${t.confidence} between 0 and 1`,
    ),
  ],
);

export const severityFlag = pgTable(
  'severity_flag',
  {
    id: serial('id').primaryKey(),
    incidentId: integer('incident_id')
      .notNull()
      .references(() => incident.id, { onDelete: 'cascade' }),
    recordedSeverity: smallint('recorded_severity'),
    suggestedSeverity: smallint('suggested_severity'),
    isInconsistent: boolean('is_inconsistent').notNull(),
    confidence: numeric('confidence', { precision: 4, scale: 3 }),
    reasoning: text('reasoning').notNull(),
    evidenceQuote: text('evidence_quote').notNull(),
    model: text('model').notNull(),
    promptVersion: text('prompt_version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('severity_flag_incident_idx').on(t.incidentId),
    check(
      'severity_flag_confidence_range',
      sql`${t.confidence} is null or ${t.confidence} between 0 and 1`,
    ),
  ],
);
