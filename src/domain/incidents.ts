// Counts by severity, type, site and month. Severity is nullable throughout -
// one incident could not be resolved, and it gets counted on its own rather
// than folded into a band.
import { sql } from 'drizzle-orm';
import type { Tx } from '../db/client.js';
import type { IncidentSummary, IncidentTrend } from '../contracts/index.js';

export async function incidentSummary(tx: Tx): Promise<IncidentSummary> {
  const [total, bySeverity, byType, bySite] = await Promise.all([
    tx.execute<{ n: number }>(sql`select count(*)::int as n from incident`),
    tx.execute<{ severity: number | null; n: number }>(sql`
      select severity_normalised as severity, count(*)::int as n
      from incident group by 1 order by 1 nulls last
    `),
    tx.execute<{ type_code: string; n: number }>(sql`
      select type_code, count(*)::int as n
      from incident group by 1 order by 2 desc, 1
    `),
    tx.execute<{ site: string | null; n: number }>(sql`
      select s.canonical_name as site, count(*)::int as n
      from incident i left join site s on s.id = i.site_id
      group by 1 order by 2 desc, 1
    `),
  ]);

  return {
    total: total.rows[0]?.n ?? 0,
    bySeverity: bySeverity.rows.map((r) => ({ severity: r.severity, count: r.n })),
    byType: byType.rows.map((r) => ({ typeCode: r.type_code, count: r.n })),
    bySite: bySite.rows.map((r) => ({ site: r.site, count: r.n })),
    unresolvedSeverity: bySeverity.rows.find((r) => r.severity === null)?.n ?? 0,
  };
}

// Through the calendar, so an incident-free month is a zero rather than a gap.
export async function incidentTrend(tx: Tx): Promise<IncidentTrend> {
  const result = await tx.execute<{ month: string; severity: number | null; n: number }>(sql`
    select to_char(rp.period_month, 'YYYY-MM') as month,
           i.severity_normalised                as severity,
           count(i.id)::int                     as n
    from report_period rp
    left join incident i on date_trunc('month', i.incident_date) = rp.period_month
    group by 1, 2
    order by 1, 2 nulls last
  `);

  const byMonth = new Map<string, { total: number; bySeverity: Record<string, number> }>();
  for (const r of result.rows) {
    const entry = byMonth.get(r.month) ?? { total: 0, bySeverity: {} };
    if (r.n > 0) {
      entry.total += r.n;
      entry.bySeverity[r.severity === null ? 'unresolved' : String(r.severity)] = r.n;
    }
    byMonth.set(r.month, entry);
  }

  return {
    months: [...byMonth.entries()].map(([month, v]) => ({
      month,
      total: v.total,
      bySeverity: v.bySeverity,
    })),
  };
}
