/**
 * The rule catalogue: every data problem this pipeline knows how to recognise.
 *
 * One entry per rule, each with a stable code, the action taken, and the
 * reasoning for that action. Findings reference these codes, so the data
 * quality report, the tests and the write-up all describe the same set of
 * decisions rather than three drifting copies of it.
 */

export type RuleAction = 'fixed' | 'flagged' | 'rejected';
export type RuleSeverity = 'info' | 'warning' | 'critical';

export interface Rule {
  code: string;
  dataset: string;
  action: RuleAction;
  severity: RuleSeverity;
  /** Written for the sustainability lead, not for a developer. */
  message: string;
  /** Why this action and not one of the other two. */
  rationale: string;
  /** True when the rule describes the file as a whole rather than one row. */
  fileLevel?: true;
}

const rules = [
  /* -- fuel_deliveries.csv ------------------------------------------------- */
  {
    code: 'FUEL_HEADER_WHITESPACE',
    dataset: 'fuel_deliveries',
    action: 'fixed',
    severity: 'info',
    message: 'Column headings contain leading or trailing spaces.',
    rationale: 'Whitespace in a heading carries no meaning; trimming cannot lose information.',
    fileLevel: true,
  },
  {
    code: 'FUEL_DATE_FORMAT',
    dataset: 'fuel_deliveries',
    action: 'fixed',
    severity: 'info',
    message: 'Delivery date recorded in a non-ISO format.',
    rationale:
      'Slash dates are unambiguously day-first: 66 rows have a first component above 12 and ' +
      'none has a second component above 12, so no row can be read month-first.',
  },
  {
    code: 'FUEL_DATE_MONTH_ONLY',
    dataset: 'fuel_deliveries',
    action: 'flagged',
    severity: 'warning',
    message: 'Delivery date gives only a month, with no day.',
    rationale:
      'Mon-YY values genuinely lack a day. The row is dated to the first of the month and ' +
      'marked month-precision, so monthly totals stay correct while the imprecision remains visible.',
  },
  {
    code: 'FUEL_UNIT_KL',
    dataset: 'fuel_deliveries',
    action: 'fixed',
    severity: 'warning',
    message: 'Quantity recorded in kilolitres rather than litres.',
    rationale:
      'Implied cost per litre confirms these are genuine kilolitre entries rather than ' +
      'mislabelled litres. Converting at ×1000 puts every row on one unit.',
  },
  {
    code: 'FUEL_UNIT_SPELLING',
    dataset: 'fuel_deliveries',
    action: 'fixed',
    severity: 'info',
    message: 'Unit written as "litres" or "Litres" rather than "L".',
    rationale: 'A spelling variant of the same unit; normalising changes no quantity.',
  },
  {
    code: 'FUEL_COST_FORMAT',
    dataset: 'fuel_deliveries',
    action: 'fixed',
    severity: 'info',
    message: 'Cost recorded with a currency symbol and thousands separators.',
    rationale: 'Presentation formatting around an unambiguous number.',
  },
  {
    code: 'FUEL_EXACT_DUPLICATE',
    dataset: 'fuel_deliveries',
    action: 'flagged',
    severity: 'warning',
    message: 'Delivery is byte-identical to an earlier row.',
    rationale:
      'Seven invoices appear twice with every field identical. Duplicate export is far more ' +
      'likely than two identical deliveries, so the later copy is excluded from totals and ' +
      'kept with a link to the row it repeats.',
  },
  {
    code: 'FUEL_CREDIT_NOTE',
    dataset: 'fuel_deliveries',
    action: 'flagged',
    severity: 'warning',
    message: 'Delivery has a negative quantity and cost.',
    rationale:
      'INV-41777 records −12,500 L and −$23,375 with an invoice number outside the surrounding ' +
      'sequence: a credit note reversing an over-delivery. Rejecting it as invalid would ' +
      'overstate Scope 1 by 12,500 litres of diesel.',
  },
  {
    code: 'FUEL_PRICE_OUTLIER',
    dataset: 'fuel_deliveries',
    action: 'flagged',
    severity: 'warning',
    message: 'Implied cost per litre falls outside the observed range.',
    rationale:
      'A guard rather than a correction. Cost and quantity agree across the file at $1.72–$1.94 ' +
      'per litre; a row outside that band suggests one of the two was mis-keyed.',
  },
  {
    code: 'FUEL_MONTH_GAP',
    dataset: 'fuel_deliveries',
    action: 'flagged',
    severity: 'warning',
    message: 'A month in the reporting window contains no deliveries at all.',
    rationale:
      'November 2025 has no rows. Reporting it as zero litres would assert that no diesel was ' +
      'burned; the honest statement is that no delivery data exists for that month.',
    fileLevel: true,
  },

  /* -- electricity_meter_readings.csv -------------------------------------- */
  {
    code: 'ELEC_UNIT_SCALE_BREAK',
    dataset: 'electricity_meter_readings',
    action: 'fixed',
    severity: 'critical',
    message: 'Meter reporting in megawatt-hours while still labelled kWh.',
    rationale:
      'MTR-07 falls from 274,791 to 277 between September and October 2025 and never recovers, ' +
      'while site load is otherwise stable and no other meter shows a comparable step. ' +
      'Uncorrected, this understates Scope 2 by roughly 1,544 t CO2e.',
  },
  {
    code: 'ELEC_METER_ID_GAP',
    dataset: 'electricity_meter_readings',
    action: 'flagged',
    severity: 'warning',
    message: 'A meter identifier is absent from an otherwise complete sequence.',
    rationale:
      'Meters MTR-01 to MTR-07 are present except MTR-06, and every meter that does appear has ' +
      'complete 18-month coverage. The impact cannot be quantified, because the meter may have ' +
      'been decommissioned rather than omitted. For scale, a seventh meter of median size would ' +
      'represent roughly 2,500 t CO2e over the period, computed after the MTR-07 correction. ' +
      'This is a question for the site, not a correction we can make.',
    fileLevel: true,
  },
  {
    code: 'ELEC_SITE_UNMAPPED',
    dataset: 'electricity_meter_readings',
    action: 'flagged',
    severity: 'info',
    message: 'Meter cannot be attributed to an operational area.',
    rationale:
      'Five of six meter descriptions name functional systems rather than places. Assigning ' +
      'them to a site would invent a relationship the source data does not support.',
  },

  /* -- incident_register.csv ------------------------------------------------ */
  {
    code: 'INC_DATE_FORMAT',
    dataset: 'incident_register',
    action: 'fixed',
    severity: 'info',
    message: 'Incident date recorded in day-first rather than ISO format.',
    rationale: 'Same day-first evidence as the fuel file; no row can be read month-first.',
  },
  {
    code: 'INC_SEVERITY_TEXTUAL',
    dataset: 'incident_register',
    action: 'fixed',
    severity: 'warning',
    message: 'Severity recorded as text where the register elsewhere uses numbers.',
    rationale:
      'Resolved per incident from numerically coded incidents sharing the same description. ' +
      '"Low" stands in for 1 in some incident types and 2 in others, so a single global ' +
      'mapping would be wrong for one group or the other.',
  },
  {
    code: 'INC_SEVERITY_UNRESOLVED',
    dataset: 'incident_register',
    action: 'flagged',
    severity: 'warning',
    message: 'Textual severity cannot be resolved to a number.',
    rationale:
      'INC-2025-011 is the only textual severity whose description has no numerically coded ' +
      'counterpart. Severity is left null rather than coerced into a value we cannot defend.',
  },
  {
    code: 'INC_ID_COLLISION',
    dataset: 'incident_register',
    action: 'flagged',
    severity: 'warning',
    message: 'Incident identifier is used for more than one incident.',
    rationale:
      'INC-2025-011 appears against two different events. The identifier is treated as an ' +
      'ordinary column rather than a key, and both rows are kept.',
  },

  /* -- suppliers.csv --------------------------------------------------------- */
  {
    code: 'SUP_DUPLICATE_ABN',
    dataset: 'suppliers',
    action: 'fixed',
    severity: 'warning',
    message: 'Two supplier records share an ABN.',
    rationale:
      'Blackwood appears twice, once with "Maintanence" misspelled, under the identical ABN ' +
      '84 112 334 908. A shared ABN is proof of a single entity, so the rows are merged with ' +
      'the match recorded as ABN-based.',
  },
  {
    code: 'SUP_DUPLICATE_NAME',
    dataset: 'suppliers',
    action: 'flagged',
    severity: 'warning',
    message: 'Two supplier records appear to name the same company.',
    rationale:
      'Ironline appears as "Pty Ltd" and "P/L", but the second row has no ABN, so the match ' +
      'rests on name normalisation alone. Merged, with the weaker evidence recorded so the ' +
      'inference is not mistaken for a proven identity.',
  },
  {
    code: 'SUP_ABN_FORMAT',
    dataset: 'suppliers',
    action: 'flagged',
    severity: 'warning',
    message: 'ABN does not have eleven digits.',
    rationale:
      'TerraForm Rehabilitation Co carries a seven-digit value. Format is checked; the ' +
      'modulus-89 checksum is not applied, because every ABN in this file is synthetic and ' +
      'would fail it.',
  },
  {
    code: 'SUP_ABN_MISSING',
    dataset: 'suppliers',
    action: 'flagged',
    severity: 'info',
    message: 'Supplier has no ABN recorded.',
    rationale:
      'Two rows have the field blank. The supplier is still loaded; the gap is reported so it ' +
      'can be filled at source.',
  },
] as const satisfies readonly Rule[];

export type RuleCode = (typeof rules)[number]['code'];

export const RULES: Record<RuleCode, Rule> = Object.fromEntries(
  rules.map((r) => [r.code, r]),
) as Record<RuleCode, Rule>;

export function rule(code: RuleCode): Rule {
  return RULES[code];
}

export const ALL_RULES: readonly Rule[] = rules;
