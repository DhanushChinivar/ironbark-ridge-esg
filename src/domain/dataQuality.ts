// Everything found wrong or suspicious, with the reasoning for each decision.
// The per-file counters are what make "nothing was dropped" checkable.
import { sql } from 'drizzle-orm';
import type { Tx } from '../db/client.js';
import type { DataQualityReport, Evidence } from '../contracts/index.js';

interface FindingRow extends Record<string, unknown> {
  id: number;
  rule_code: string;
  dataset: string;
  severity: 'info' | 'warning' | 'critical';
  action: 'fixed' | 'flagged' | 'rejected';
  message: string;
  rationale: string;
  field: string | null;
  original_value: string | null;
  corrected_value: string | null;
  detail: unknown;
  source_row_id: number | null;
  source_row_number: number | null;
}

const toFinding = (r: FindingRow) => ({
  id: r.id,
  ruleCode: r.rule_code,
  dataset: r.dataset,
  severity: r.severity,
  action: r.action,
  message: r.message,
  rationale: r.rationale,
  field: r.field,
  originalValue: r.original_value,
  correctedValue: r.corrected_value,
  detail: r.detail ?? null,
  sourceRowId: r.source_row_id,
  sourceRowNumber: r.source_row_number,
});

export async function dataQualityReport(tx: Tx): Promise<DataQualityReport> {
  const [files, byRule, findings] = await Promise.all([
    tx.execute<{
      file_name: string;
      content_hash: string;
      rows_read: number;
      rows_promoted: number;
      rows_flagged: number;
      rows_rejected: number;
    }>(sql`
      select file_name, content_hash, rows_read, rows_promoted, rows_flagged, rows_rejected
      from source_file order by file_name
    `),
    tx.execute<{
      rule_code: string;
      dataset: string;
      action: 'fixed' | 'flagged' | 'rejected';
      severity: 'info' | 'warning' | 'critical';
      n: number;
      message: string;
      rationale: string;
    }>(sql`
      select rule_code, dataset, action, severity, count(*)::int as n,
             min(message) as message, min(rationale) as rationale
      from data_quality_finding
      group by rule_code, dataset, action, severity
      order by dataset, rule_code
    `),
    tx.execute<FindingRow>(sql`
      select d.id, d.rule_code, d.dataset, d.severity, d.action, d.message, d.rationale,
             d.field, d.original_value, d.corrected_value, d.detail,
             d.source_row_id, sr.row_number as source_row_number
      from data_quality_finding d
      left join source_row sr on sr.id = d.source_row_id
      order by d.dataset, d.rule_code, sr.row_number nulls first
    `),
  ]);

  const count = (action: string) =>
    byRule.rows.filter((r) => r.action === action).reduce((a, r) => a + r.n, 0);

  return {
    files: files.rows.map((f) => ({
      fileName: f.file_name,
      contentHash: f.content_hash,
      rowsRead: f.rows_read,
      rowsPromoted: f.rows_promoted,
      rowsFlagged: f.rows_flagged,
      rowsRejected: f.rows_rejected,
    })),
    byRule: byRule.rows.map((r) => ({
      ruleCode: r.rule_code,
      dataset: r.dataset,
      action: r.action,
      severity: r.severity,
      count: r.n,
      message: r.message,
      rationale: r.rationale,
    })),
    findings: findings.rows.map(toFinding),
    totals: {
      findings: findings.rows.length,
      fixed: count('fixed'),
      flagged: count('flagged'),
      rejected: count('rejected'),
    },
  };
}

// Drill-down: the row as it arrived, plus everything decided about it.
export async function evidenceForRow(tx: Tx, sourceRowId: number): Promise<Evidence | null> {
  const row = await tx.execute<{
    id: number;
    file_name: string;
    row_number: number;
    raw: Record<string, string>;
    disposition: 'promoted' | 'rejected';
  }>(sql`
    select sr.id, sf.file_name, sr.row_number, sr.raw, sr.disposition
    from source_row sr join source_file sf on sf.id = sr.source_file_id
    where sr.id = ${sourceRowId}
  `);

  const found = row.rows[0];
  if (!found) return null;

  const findings = await tx.execute<FindingRow>(sql`
    select d.id, d.rule_code, d.dataset, d.severity, d.action, d.message, d.rationale,
           d.field, d.original_value, d.corrected_value, d.detail,
           d.source_row_id, ${found.row_number}::int as source_row_number
    from data_quality_finding d
    where d.source_row_id = ${sourceRowId}
    order by d.rule_code
  `);

  return {
    sourceRowId: found.id,
    fileName: found.file_name,
    rowNumber: found.row_number,
    raw: found.raw,
    disposition: found.disposition,
    findings: findings.rows.map(toFinding),
  };
}
