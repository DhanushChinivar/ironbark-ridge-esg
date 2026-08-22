// Turns row numbers into database ids, writes the findings, reconciles the
// counters. The counters have check constraints on them, so a miscount fails
// the write instead of shipping a report that doesn't add up.
import { eq, inArray } from 'drizzle-orm';
import type { Tx } from '../db/client.js';
import { dataQualityFinding, sourceFile, sourceRow } from '../db/schema.js';
import { RULES } from '../rules/catalogue.js';
import { isRejecting, type Finding } from '../rules/finding.js';
import { validateDetail } from '../rules/findingDetail.js';
import type { LandedFile } from '../ingest/land.js';

export interface PromotionSummary {
  fileName: string;
  rowsRead: number;
  rowsPromoted: number;
  rowsFlagged: number;
  rowsRejected: number;
  findings: number;
}

export async function writeFindings(
  tx: Tx,
  ingestionRunId: number,
  landed: LandedFile,
  dataset: string,
  findings: Finding[],
): Promise<PromotionSummary> {
  // file position -> database id, from landing.
  const rowIdByNumber = new Map(landed.rows.map((r) => [r.rowNumber, r.id]));

  const rejectedRowNumbers = new Set(
    findings
      .filter(isRejecting)
      .map((f) => f.sourceRowNumber)
      .filter((n): n is number => n !== null),
  );

  // Rows, not findings. Ironline's duplicate has two flagged findings but is one
  // flagged row, and counting findings would eventually break the constraint.
  const flaggedRowNumbers = new Set(
    findings
      .filter((f) => RULES[f.ruleCode].action === 'flagged')
      .map((f) => f.sourceRowNumber)
      .filter((n): n is number => n !== null && !rejectedRowNumbers.has(n)),
  );

  const values = findings.map((f) => {
    const r = RULES[f.ruleCode];
    return {
      ingestionRunId,
      ruleCode: f.ruleCode,
      // From the catalogue, so a finding can't contradict its own rule.
      severity: r.severity,
      action: r.action,
      dataset,
      sourceRowId:
        f.sourceRowNumber === null ? null : (rowIdByNumber.get(f.sourceRowNumber) ?? null),
      field: f.field ?? null,
      originalValue: f.originalValue ?? null,
      correctedValue: f.correctedValue ?? null,
      message: r.message,
      rationale: r.rationale,
      // Throws if the payload doesn't match the shape declared for this rule.
      detail: validateDetail(f.ruleCode, f.detail),
    };
  });

  for (let i = 0; i < values.length; i += 200) {
    await tx.insert(dataQualityFinding).values(values.slice(i, i + 200));
  }

  if (rejectedRowNumbers.size) {
    const ids = [...rejectedRowNumbers]
      .map((n) => rowIdByNumber.get(n))
      .filter((id): id is number => id !== undefined);
    await tx.update(sourceRow).set({ disposition: 'rejected' }).where(inArray(sourceRow.id, ids));
  }

  const summary: PromotionSummary = {
    fileName: landed.fileName,
    rowsRead: landed.rows.length,
    rowsPromoted: landed.rows.length - rejectedRowNumbers.size,
    rowsFlagged: flaggedRowNumbers.size,
    rowsRejected: rejectedRowNumbers.size,
    findings: findings.length,
  };

  // All four together: rows_read alone would break the balance check.
  await tx
    .update(sourceFile)
    .set({
      rowsRead: summary.rowsRead,
      rowsPromoted: summary.rowsPromoted,
      rowsFlagged: summary.rowsFlagged,
      rowsRejected: summary.rowsRejected,
    })
    .where(eq(sourceFile.id, landed.sourceFileId));

  return summary;
}
