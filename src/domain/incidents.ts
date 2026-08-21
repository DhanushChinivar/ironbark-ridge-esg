// Counts by severity, type, site and month. Severity is nullable throughout -
// one incident could not be resolved, and it gets counted on its own rather
// than folded into a band.
import { sql, type SQL } from 'drizzle-orm';
import type { Tx } from '../db/client.js';
import type { IncidentSummary, IncidentTrend } from '../contracts/index.js';

export async function incidentSummary(tx: Tx): Promise<IncidentSummary> {
  const [total, bySeverity, byType, bySite] = await Promise.all([
    tx.execute<{ n: number }>(sql`select count(*)::int as n from incident`),
    tx.execute<{ severity: number | null; n: number }>(sql`
      select severity_normalised as severity, count(*)::int as n
      from incident group by 1 order by 1 nulls last
    `),
    tx.execute<{ type_code: string | null; n: number }>(sql`
      select type_code, count(*)::int as n
      from incident group by 1 order by 2 desc, 1 nulls last
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
// Severity and type are counted in two passes. Grouping by both at once would
// key each month on the pair, and a month with three VEH incidents at three
// different severities would then report VEH three times with a count of one.
export async function incidentTrend(tx: Tx): Promise<IncidentTrend> {
  const monthly = (breakdown: SQL) => sql`
    select to_char(rp.period_month, 'YYYY-MM') as month,
           ${breakdown}                        as key,
           count(i.id)::int                    as n
    from report_period rp
    left join incident i on date_trunc('month', i.incident_date) = rp.period_month
    group by 1, 2
    order by 1, 2 nulls last
  `;

  type Row = { month: string; key: string | null; n: number };
  const [severity, type] = await Promise.all([
    tx.execute<Row>(monthly(sql`i.severity_normalised::text`)),
    tx.execute<Row>(monthly(sql`i.type_code`)),
  ]);

  type Month = IncidentTrend['months'][number];
  const months = new Map<string, Month>();
  const month = (name: string) => {
    const existing = months.get(name);
    if (existing) return existing;
    const fresh: Month = { month: name, total: 0, bySeverity: {}, byType: {} };
    months.set(name, fresh);
    return fresh;
  };

  // The severity pass runs first and owns the total, so the month keys come out
  // in calendar order and an empty month still appears.
  for (const r of severity.rows) {
    const m = month(r.month);
    if (r.n === 0) continue;
    m.total += r.n;
    m.bySeverity[r.key ?? 'unresolved'] = r.n;
  }

  for (const r of type.rows) {
    if (r.n === 0) continue;
    month(r.month).byType[r.key ?? 'uncoded'] = r.n;
  }

  return { months: [...months.values()] };
}
