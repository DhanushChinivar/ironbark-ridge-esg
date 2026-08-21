import { describe, expect, it } from 'vitest';
import { db } from '../../src/db/client.js';
import { incidentSummary, incidentTrend } from '../../src/domain/incidents.js';

// Against the ingested database, because what these check is the SQL: the
// grouping, the nullable severity, and the calendar join.
describe('incidentSummary', () => {
  it('counts every incident in the register', async () => {
    expect((await incidentSummary(db)).total).toBe(42);
  });

  it('counts the one incident whose severity could not be resolved', async () => {
    const s = await incidentSummary(db);
    expect(s.unresolvedSeverity).toBe(1);
    // It appears in the breakdown as null rather than being dropped or
    // silently folded into another band.
    expect(s.bySeverity.some((b) => b.severity === null)).toBe(true);
  });

  it('accounts for every incident across the severity breakdown', async () => {
    const s = await incidentSummary(db);
    expect(s.bySeverity.reduce((a, b) => a + b.count, 0)).toBe(s.total);
  });

  it('accounts for every incident across the type breakdown', async () => {
    const s = await incidentSummary(db);
    expect(s.byType.reduce((a, b) => a + b.count, 0)).toBe(s.total);
  });

  it('groups by the seven type codes the register uses', async () => {
    const types = (await incidentSummary(db)).byType.map((t) => t.typeCode).sort();
    expect(types).toEqual(['DUS', 'ELE', 'ENV', 'EQP', 'OTH', 'SLP', 'VEH']);
  });

  it('resolves every incident to a site, because the labels all map', async () => {
    // Unlike the meters, incident locations share the fuel file's vocabulary,
    // so none should be unattributed.
    const s = await incidentSummary(db);
    expect(s.bySite.filter((b) => b.site === null)).toHaveLength(0);
  });
});

describe('incidentTrend', () => {
  it('returns every month in the window, not only months with incidents', async () => {
    expect((await incidentTrend(db)).months).toHaveLength(18);
  });

  it('totals to the same number as the summary', async () => {
    const [trend, summary] = await Promise.all([incidentTrend(db), incidentSummary(db)]);
    expect(trend.months.reduce((a, m) => a + m.total, 0)).toBe(summary.total);
  });

  it('keeps each month consistent with its own severity breakdown', async () => {
    for (const m of (await incidentTrend(db)).months) {
      const fromBands = Object.values(m.bySeverity).reduce((a, n) => a + n, 0);
      expect(fromBands).toBe(m.total);
    }
  });

  it('labels an unresolved severity rather than omitting it', async () => {
    const withUnresolved = (await incidentTrend(db)).months.filter(
      (m) => m.bySeverity.unresolved !== undefined,
    );
    expect(withUnresolved).toHaveLength(1);
  });
});
