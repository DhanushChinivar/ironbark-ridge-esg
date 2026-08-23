import { describe, expect, it } from 'vitest';
import {
  abnDigits,
  applySupplierRules,
  normaliseName,
  parseSpend,
  type RawSupplierRow,
} from '../../src/rules/suppliers.js';

// Rows lifted verbatim from suppliers.csv, misspelling and blank ABNs included.
// A passing test then says something about the data we were given rather than
// about an example written to make the code look good.
const rows: RawSupplierRow[] = (
  [
    ['Ironline Fuel Distributors Pty Ltd', '63 004 085 616', 'Fuel supply', '8940000'],
    ['Ironline Fuel Distributors P/L', '', 'Fuel', '1212000'],
    ['Queensland Grid Energy Retail', '21 010 991 452', 'Electricity retail', '3480000'],
    ['Blackwood Heavy Maintenance', '84 112 334 908', 'Fleet maintenance', '2150000'],
    ['Blackwood Heavy Maintanence', '84 112 334 908', 'Fleet maintenance', '415000'],
    ['Apex Drill & Blast Services', '39 601 227 114', 'Drill and blast', '4720000'],
    ['Coral Coast Camp Catering', '77 098 445 231', 'Camp services', '1890000'],
    ['TerraForm Rehabilitation Co', '5501822', 'Rehabilitation earthworks', '960000'],
    ['SafeGuard PPE Supplies', '', 'PPE and consumables', '310000'],
  ] as const
).map(([supplier_name, abn, category, fy_spend_aud], i) => ({
  rowNumber: i + 1,
  supplier_name,
  abn,
  category,
  fy_spend_aud,
}));

const IRONLINE = 1;
const IRONLINE_DUP = 2;
const BLACKWOOD = 4;
const BLACKWOOD_DUP = 5;
const CORAL_COAST = 7;
const TERRAFORM = 8;
const SAFEGUARD = 9;

describe('normaliseName', () => {
  it('treats legal-form suffixes as carrying no identity', () => {
    expect(normaliseName('Ironline Fuel Distributors Pty Ltd')).toBe(
      normaliseName('Ironline Fuel Distributors P/L'),
    );
  });

  it('cannot match across a misspelling, which is why ABN matching exists', () => {
    expect(normaliseName('Blackwood Heavy Maintenance')).not.toBe(
      normaliseName('Blackwood Heavy Maintanence'),
    );
  });

  it('does not eat "Co" inside a word', () => {
    // "co" is in the suffix list, so Coral Coast breaks without \b anchors.
    expect(normaliseName('Coral Coast Camp Catering')).toBe('coral coast camp catering');
  });

  it('keeps genuinely different companies apart', () => {
    expect(normaliseName('Apex Drill & Blast Services')).not.toBe(
      normaliseName('Queensland Grid Energy Retail'),
    );
  });
});

describe('abnDigits', () => {
  it('strips the spaces an ABN is conventionally written with', () => {
    expect(abnDigits('63 004 085 616')).toBe('63004085616');
  });

  it('returns null for a blank field, keeping absent distinct from malformed', () => {
    expect(abnDigits('')).toBeNull();
  });

  it('returns the digits of a short ABN rather than rejecting it outright', () => {
    expect(abnDigits('5501822')).toBe('5501822');
  });
});

describe('parseSpend', () => {
  it('reads a plain integer', () => {
    expect(parseSpend('8940000')).toBe('8940000.00');
  });

  it('reads a formatted amount, in case the export style changes', () => {
    expect(parseSpend('$1,212,000')).toBe('1212000.00');
  });

  it('returns null rather than zero for a blank, so no spend is not free', () => {
    expect(parseSpend('')).toBeNull();
  });
});

describe('applySupplierRules', () => {
  const { suppliers, findings } = applySupplierRules(rows);
  const byRow = (n: number) => suppliers.find((s) => s.rowNumber === n);
  const codes = findings.map((f) => f.ruleCode);

  it('keeps every source row rather than deleting duplicates', () => {
    expect(suppliers).toHaveLength(rows.length);
  });

  it('matches Blackwood on its shared ABN, despite the misspelling', () => {
    expect(byRow(BLACKWOOD_DUP)?.canonicalRowNumber).toBe(BLACKWOOD);
    expect(byRow(BLACKWOOD_DUP)?.matchMethod).toBe('abn');
  });

  it('matches Ironline on name only, because the duplicate has no ABN', () => {
    expect(byRow(IRONLINE_DUP)?.canonicalRowNumber).toBe(IRONLINE);
    expect(byRow(IRONLINE_DUP)?.matchMethod).toBe('name');
  });

  it('prefers the record carrying an ABN as the canonical one', () => {
    expect(byRow(IRONLINE)?.abnDigits).toBe('63004085616');
    expect(byRow(IRONLINE)?.canonicalRowNumber).toBeNull();
  });

  it('does not merge two companies that merely share a category', () => {
    expect(byRow(CORAL_COAST)?.canonicalRowNumber).toBeNull();
    expect(byRow(3)?.canonicalRowNumber).toBeNull();
  });

  it('flags a seven-digit ABN as malformed rather than rejecting the supplier', () => {
    expect(byRow(TERRAFORM)?.abnFormatValid).toBe(false);
    expect(codes).toContain('SUP_ABN_FORMAT');
  });

  it('reports a missing ABN as a separate problem from a malformed one', () => {
    expect(byRow(SAFEGUARD)?.abnFormatValid).toBeNull();
    expect(codes.filter((c) => c === 'SUP_ABN_MISSING')).toHaveLength(2);
  });

  it('loads a supplier with no ABN rather than dropping it', () => {
    expect(byRow(SAFEGUARD)?.fySpendAud).toBe('310000.00');
  });

  it('does not use a malformed ABN for matching', () => {
    // A 7-digit value could collide with another short one by accident.
    expect(byRow(TERRAFORM)?.matchMethod).toBeNull();
  });

  it('records the evidence for each merge in the finding detail', () => {
    expect(findings.find((f) => f.ruleCode === 'SUP_DUPLICATE_ABN')?.detail).toMatchObject({
      evidence: 'abn',
      abn: '84112334908',
      mergedIntoRowNumber: BLACKWOOD,
    });
    expect(findings.find((f) => f.ruleCode === 'SUP_DUPLICATE_NAME')?.detail).toMatchObject({
      evidence: 'name',
      mergedIntoRowNumber: IRONLINE,
    });
  });

  it('reports a field the two rows disagreed on, rather than dropping it', () => {
    const conflicts = findings.filter((f) => f.ruleCode === 'SUP_MERGE_FIELD_CONFLICT');

    // Ironline is "Fuel supply" on one row and "Fuel" on the other. Blackwood's
    // rows agree, so only one merge has anything to report.
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.sourceRowNumber).toBe(IRONLINE_DUP);
    expect(conflicts[0]?.detail).toMatchObject({
      field: 'category',
      evidence: 'name',
      kept: 'Fuel supply',
      discarded: 'Fuel',
      mergedIntoRowNumber: IRONLINE,
    });
  });

  it('says nothing where the merged rows agreed on every field', () => {
    const onBlackwood = findings.filter(
      (f) => f.ruleCode === 'SUP_MERGE_FIELD_CONFLICT' && f.sourceRowNumber === BLACKWOOD_DUP,
    );
    expect(onBlackwood).toHaveLength(0);
  });

  it('attaches every finding to the row that caused it', () => {
    for (const f of findings) {
      expect(f.sourceRowNumber).not.toBeNull();
      expect(suppliers.some((s) => s.rowNumber === f.sourceRowNumber)).toBe(true);
    }
  });

  it('resolves each duplicate pair to a single company', () => {
    // Full file is 15 rows to 13 companies; this fixture is 9 to 7.
    const canonical = suppliers.filter((s) => s.canonicalRowNumber === null);
    expect(canonical).toHaveLength(rows.length - 2);
  });

  it('leaves spend on both rows of a pair, so nothing is lost by merging', () => {
    const ironline = suppliers.filter((s) => s.nameRaw.startsWith('Ironline'));
    const total = ironline.reduce((sum, s) => sum + Number(s.fySpendAud), 0);
    expect(total).toBe(10152000);
  });
});

// Constructed rows, not from the file.
//
// Our two duplicate pairs happen to be separable - Blackwood matches only on ABN,
// Ironline only on name - so nothing here exercises the ordering guard. A real
// supplier list usually has duplicates sharing both, which is the case that
// needs it.
describe('when a duplicate shares both an ABN and a name', () => {
  const both: RawSupplierRow[] = [
    { rowNumber: 1, supplier_name: 'Statewide Tyre Management', abn: '66 120 908 445', category: 'OTR tyres', fy_spend_aud: '1540000' },
    { rowNumber: 2, supplier_name: 'Statewide Tyre Management Pty Ltd', abn: '66 120 908 445', category: 'OTR tyres', fy_spend_aud: '220000' },
  ];

  it('records the stronger evidence, not whichever pass ran last', () => {
    const { suppliers } = applySupplierRules(both);
    const dup = suppliers.find((s) => s.rowNumber === 2);
    expect(dup?.canonicalRowNumber).toBe(1);
    // Both passes match this pair. Without the guard it reads 'name', and the
    // database describes a proof as an inference.
    expect(dup?.matchMethod).toBe('abn');
  });

  it('raises one finding, not one per matching strategy', () => {
    const { findings } = applySupplierRules(both);
    const merges = findings.filter((f) => f.ruleCode.startsWith('SUP_DUPLICATE'));
    expect(merges).toHaveLength(1);
    expect(merges[0]?.ruleCode).toBe('SUP_DUPLICATE_ABN');
  });
});
