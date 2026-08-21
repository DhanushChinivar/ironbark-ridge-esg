import { describe, expect, it } from 'vitest';
import { db } from '../../src/db/client.js';
import { monthlyEmissions } from '../../src/domain/emissions.js';

// Against the real database, because what these check is the SQL. The expected
// figures came from a separate Python pass over the CSVs before any of this
// existed.
describe('monthlyEmissions', () => {
  it('computes Scope 1 as measured by hand from the source files', async () => {
    const { totals } = await monthlyEmissions(db, 'corrected');
    expect(totals.scope1Tco2e).toBeCloseTo(22052.5, 1);
  });

  it('computes Scope 2 on both bases, and the difference between them', async () => {
    const { correction } = await monthlyEmissions(db, 'corrected');
    expect(correction.scope2AsReportedTco2e).toBeCloseTo(23333.2, 1);
    expect(correction.scope2CorrectedTco2e).toBeCloseTo(24877.4, 1);
    // The MTR-07 unit break.
    expect(correction.differenceTco2e).toBeCloseTo(1544.2, 1);
  });

  it('reports a lower Scope 2 on the as-reported basis', async () => {
    const corrected = await monthlyEmissions(db, 'corrected');
    const asReported = await monthlyEmissions(db, 'as_reported');
    expect(asReported.totals.scope2Tco2e).toBeLessThan(corrected.totals.scope2Tco2e);
    // Scope 1 is untouched by the meter correction.
    expect(asReported.totals.scope1Tco2e).toBe(corrected.totals.scope1Tco2e);
  });

  it('does not fan out when a month has both deliveries and readings', async () => {
    // Guards the fan-out: Feb 2026 has 10 deliveries and 6 readings, so joining
    // both to the calendar at once would inflate Scope 1 six-fold.
    const { months } = await monthlyEmissions(db, 'corrected');
    const feb = months.find((m) => m.month === '2026-02');
    expect(feb?.fuelDeliveries).toBeGreaterThan(1);
    expect(feb?.meterReadings).toBeGreaterThan(1);
    expect(feb?.scope1Tco2e).toBeCloseTo(1311.8, 1);
    expect(feb?.scope2Tco2e).toBeCloseTo(1402.6, 1);
  });

  it('returns every month in the window, including one with no deliveries', async () => {
    const { months, monthsWithoutFuelData } = await monthlyEmissions(db, 'corrected');
    expect(months).toHaveLength(18);
    expect(monthsWithoutFuelData).toEqual(['2025-11']);
  });

  it('distinguishes a month with no data from a month with zero emissions', async () => {
    const nov = (await monthlyEmissions(db, 'corrected')).months.find((m) => m.month === '2025-11');
    expect(nov?.scope1Tco2e).toBe(0);
    expect(nov?.hasFuelData).toBe(false);
    // Electricity was still metered, so the two flags differ.
    expect(nov?.hasElectricityData).toBe(true);
  });

  it('shows March 2026 emissions moving between scopes rather than falling', async () => {
    const { months } = await monthlyEmissions(db, 'corrected');
    const feb = months.find((m) => m.month === '2026-02');
    const mar = months.find((m) => m.month === '2026-03');
    expect(mar!.scope2Tco2e).toBeLessThan(feb!.scope2Tco2e * 0.5);
    expect(mar!.scope1Tco2e).toBeGreaterThan(feb!.scope1Tco2e * 1.3);
    // Total barely moves - the substation failed and generators covered it, so
    // the emissions changed scope rather than disappearing.
    expect(mar!.totalTco2e).toBeGreaterThan(feb!.totalTco2e * 0.85);
  });

  it('excludes duplicate deliveries from the totals', async () => {
    // 150 landed, 7 exact duplicates, 143 counted.
    const { months } = await monthlyEmissions(db, 'corrected');
    const deliveries = months.reduce((a, m) => a + m.fuelDeliveries, 0);
    expect(deliveries).toBe(143);
  });

  it('keeps the total equal to the sum of its scopes', async () => {
    const { months, totals } = await monthlyEmissions(db, 'corrected');
    for (const m of months) {
      expect(m.totalTco2e).toBeCloseTo(m.scope1Tco2e + m.scope2Tco2e, 1);
    }
    expect(totals.totalTco2e).toBeCloseTo(totals.scope1Tco2e + totals.scope2Tco2e, 1);
  });
});
