import { describe, expect, it } from 'vitest';
import { db } from '../../src/db/client.js';
import { emissionsCalculation } from '../../src/domain/calculation.js';
import { monthlyEmissions } from '../../src/domain/emissions.js';

// The page built on this promises a reader that the listed rows add up to the
// figure on the chart. These tests are that promise: the two are separate
// queries against the same tables, and nothing but a test keeps them agreeing.
describe('emissionsCalculation', () => {
  // All 18 months, in parallel: each call re-runs the monthly aggregate for its
  // own cross-check, so serially this is 18 round trips waiting on each other.
  it('lines add up to the month the dashboard reports, every month', async () => {
    const { months } = await monthlyEmissions(db, 'corrected');
    const calcs = await Promise.all(
      months.map((m) => emissionsCalculation(db, m.month, 'corrected')),
    );

    months.forEach((month, i) => {
      const calc = calcs[i]!;
      expect(calc.totalTco2e, `total for ${month.month}`).toBeCloseTo(month.totalTco2e, 1);

      const scope1 = calc.scopes.find((s) => s.scope === 1)!;
      const scope2 = calc.scopes.find((s) => s.scope === 2)!;
      expect(scope1.subtotalTco2e, `scope 1 for ${month.month}`).toBeCloseTo(month.scope1Tco2e, 1);
      expect(scope2.subtotalTco2e, `scope 2 for ${month.month}`).toBeCloseTo(month.scope2Tco2e, 1);
    });
  }, 30_000);

  it('serves the as-reported basis from the recorded consumption, not the corrected one', async () => {
    const [corrected, asReported] = await Promise.all([
      emissionsCalculation(db, '2026-03', 'corrected'),
      emissionsCalculation(db, '2026-03', 'as_reported'),
    ]);

    const kwh = (c: typeof corrected) => c.scopes.find((s) => s.scope === 2)!.subtotalTco2e;
    expect(kwh(corrected)).toBeGreaterThan(kwh(asReported));
    // Scope 1 has no correction of this kind, so it must not move with the basis.
    const fuel = (c: typeof corrected) => c.scopes.find((s) => s.scope === 1)!.subtotalTco2e;
    expect(fuel(corrected)).toBe(fuel(asReported));
  });

  it('lists excluded duplicates without counting them', async () => {
    // March 2025 holds two of the seven exact duplicates.
    const calc = await emissionsCalculation(db, '2025-03', 'corrected');
    const fuel = calc.scopes.find((s) => s.scope === 1)!;

    const excluded = fuel.lines.filter((l) => l.excludedBecause !== null);
    expect(excluded.length).toBeGreaterThan(0);
    expect(fuel.countedLines).toBe(fuel.lines.length - excluded.length);

    // Every excluded line is still visible, and still carries its arithmetic.
    for (const line of excluded) {
      expect(line.kgCo2e).toBeGreaterThan(0);
      expect(line.excludedBecause).toMatch(/duplicate/);
    }

    const countedKg = fuel.lines
      .filter((l) => l.excludedBecause === null)
      .reduce((a, l) => a + l.kgCo2e, 0);
    expect(fuel.subtotalKgCo2e).toBeCloseTo(countedKg, 0);
  });

  it('states every line in the units its factor is quoted in', async () => {
    const calc = await emissionsCalculation(db, '2026-03', 'corrected');
    for (const scope of calc.scopes) {
      for (const line of scope.lines) {
        expect(line.kgCo2e).toBeCloseTo(line.quantity * line.factorPerUnit, 2);
      }
    }
  });
});
