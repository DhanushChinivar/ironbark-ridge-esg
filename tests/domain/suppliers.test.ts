import { describe, expect, it } from 'vitest';
import { db } from '../../src/db/client.js';
import { supplierResolution } from '../../src/domain/suppliers.js';

// The claim this page makes is that a merge states its own evidence. These are
// the assertions behind it, plus the arithmetic that makes merging worth doing.
describe('supplierResolution', () => {
  it('accounts for every row in the file', async () => {
    const r = await supplierResolution(db);
    const absorbed = r.companies.reduce((a, c) => a + c.mergedFrom.length, 0);

    expect(r.rowsRead).toBe(15);
    expect(r.totals.companies).toBe(13);
    // Nothing vanishes: each company plus each row folded into one adds back up.
    expect(r.totals.companies + absorbed).toBe(r.rowsRead);
    expect(absorbed).toBe(r.totals.merged);
  });

  it('separates a proven match from an inferred one', async () => {
    const r = await supplierResolution(db);

    const blackwood = r.companies.find((c) => c.name.startsWith('Blackwood'))!;
    const ironline = r.companies.find((c) => c.name.startsWith('Ironline'))!;

    // A shared ABN identifies a business. The misspelt name is not what matched.
    expect(blackwood.mergedFrom[0]!.matchMethod).toBe('abn');
    expect(blackwood.mergedFrom[0]!.proven).toBe(true);
    expect(blackwood.mergedFrom[0]!.abn).toBe(blackwood.abn);

    // No ABN on the second row, so the match rests on the name alone.
    expect(ironline.mergedFrom[0]!.matchMethod).toBe('name');
    expect(ironline.mergedFrom[0]!.proven).toBe(false);
    expect(ironline.mergedFrom[0]!.abn).toBeNull();

    expect(r.totals.provenMerges).toBe(1);
    expect(r.totals.inferredMerges).toBe(1);
  });

  it('sums spend across merged rows rather than reporting the survivor alone', async () => {
    const r = await supplierResolution(db);
    const ironline = r.companies.find((c) => c.name.startsWith('Ironline'))!;

    const merged = ironline.mergedFrom.reduce((a, m) => a + (m.spendAud ?? 0), 0);
    expect(ironline.totalSpendAud).toBe((ironline.ownSpendAud ?? 0) + merged);
    // Worth doing: the survivor row alone understates the relationship.
    expect(ironline.totalSpendAud).toBeGreaterThan(ironline.ownSpendAud!);
  });

  it('reports a field the merge discarded rather than dropping it silently', async () => {
    const r = await supplierResolution(db);
    const ironline = r.companies.find((c) => c.name.startsWith('Ironline'))!;
    const blackwood = r.companies.find((c) => c.name.startsWith('Blackwood'))!;

    // The two Ironline rows disagree: "Fuel supply" is kept, "Fuel" is not.
    expect(ironline.category).toBe('Fuel supply');
    expect(ironline.mergedFrom[0]!.discardedCategory).toBe('Fuel');

    // Blackwood's rows agree, so there is nothing to report.
    expect(blackwood.mergedFrom[0]!.discardedCategory).toBeNull();
  });

  it('leaves unmerged companies with spend equal to their own row', async () => {
    const r = await supplierResolution(db);
    for (const c of r.companies.filter((x) => x.mergedFrom.length === 0)) {
      expect(c.totalSpendAud).toBe(c.ownSpendAud ?? 0);
    }
  });
});
