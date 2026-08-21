import { RULES, type RuleCode } from './catalogue.js';

// Findings carry the row number, not the database id - the rules layer has never
// seen the database. Promote does the translation.
export interface Finding {
  ruleCode: RuleCode;
  /** Null for file-level findings, which describe a dataset rather than a row. */
  sourceRowNumber: number | null;
  field?: string;
  originalValue?: string;
  correctedValue?: string;
  detail?: unknown;
}

export function finding(
  ruleCode: RuleCode,
  sourceRowNumber: number | null,
  extra: Omit<Finding, 'ruleCode' | 'sourceRowNumber'> = {},
): Finding {
  return { ruleCode, sourceRowNumber, ...extra };
}

export function isRejecting(f: Finding): boolean {
  return RULES[f.ruleCode].action === 'rejected';
}
