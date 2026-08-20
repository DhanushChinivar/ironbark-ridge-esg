import { RULES, type RuleCode } from './catalogue.js';

// A finding knows the row *number*, not the database id: the rules layer has
// never seen the database. Promote translates.
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

export function isFlagging(f: Finding): boolean {
  return RULES[f.ruleCode].action === 'flagged';
}

export function isRejecting(f: Finding): boolean {
  return RULES[f.ruleCode].action === 'rejected';
}
