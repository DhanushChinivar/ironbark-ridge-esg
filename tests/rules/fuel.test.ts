import { describe, expect, it } from 'vitest';
import {
  applyFuelRules,
  litresPerUnit,
  normaliseFuelType,
  parseCost,
  parseDeliveryDate,
  type RawFuelRow,
} from '../../src/rules/fuel.js';

// Values lifted from fuel_deliveries.csv, one per problem in the file.
const row = (
  rowNumber: number,
  rowHash: string,
  invoice_no: string,
  delivery_date: string,
  quantity: string,
  unit: string,
  cost: string,
  fuel_type = 'Diesel',
): RawFuelRow => ({
  rowNumber,
  rowHash,
  invoice_no,
  delivery_date,
  fuel_type,
  quantity,
  unit,
  cost,
  site_area: 'Processing Plant',
});

describe('parseDeliveryDate', () => {
  it('passes an ISO date through unchanged', () => {
    expect(parseDeliveryDate('2025-12-19')).toEqual({ date: '2025-12-19', precision: 'day' });
  });

  it('reads slash dates day-first, which the file proves is the only valid reading', () => {
    // 21/05 cannot be month-first: there is no month 21.
    expect(parseDeliveryDate('21/05/2026')).toEqual({ date: '2026-05-21', precision: 'day' });
  });

  it('stays day-first even where the date would also parse month-first', () => {
    expect(parseDeliveryDate('09/07/2025')).toEqual({ date: '2025-07-09', precision: 'day' });
  });

  it('dates a month-only value to the first, and says so', () => {
    expect(parseDeliveryDate('Oct-25')).toEqual({ date: '2025-10-01', precision: 'month' });
  });

  it('returns null rather than guessing at an unrecognised format', () => {
    expect(parseDeliveryDate('19th December')).toBeNull();
    expect(parseDeliveryDate('Xyz-25')).toBeNull();
  });
});

describe('litresPerUnit', () => {
  it('accepts all four spellings that appear in the file', () => {
    expect(litresPerUnit('L')).toBe(1);
    expect(litresPerUnit('litres')).toBe(1);
    expect(litresPerUnit('Litres')).toBe(1);
    expect(litresPerUnit('kL')).toBe(1000);
  });

  it('returns null for a unit it has never seen, so ingest fails loudly', () => {
    expect(litresPerUnit('gallons')).toBeNull();
  });
});

describe('parseCost', () => {
  it('reads both cost formats present in the file', () => {
    expect(parseCost('$182,946.64')).toBe(182946.64);
    expect(parseCost('132182.58')).toBe(132182.58);
  });

  it('keeps a negative cost negative', () => {
    expect(parseCost('-23375.00')).toBe(-23375);
  });

  it('returns null for a blank rather than zero', () => {
    expect(parseCost('')).toBeNull();
  });
});

describe('normaliseFuelType', () => {
  it('maps both fuel types in the file to a factor key', () => {
    expect(normaliseFuelType('Diesel')).toBe('diesel');
    expect(normaliseFuelType('Petrol (ULP)')).toBe('petrol');
  });

  it('returns null for a fuel with no factor', () => {
    expect(normaliseFuelType('LPG')).toBeNull();
  });
});

describe('applyFuelRules', () => {
  it('converts kilolitres to litres and keeps the recorded value alongside', () => {
    const { deliveries, findings } = applyFuelRules([
      row(1, 'h1', 'INV-40373', '10/05/2025', '84.03', 'kL', '$152,369.51'),
    ]);
    expect(deliveries[0]?.quantityLitres).toBe('84030');
    expect(deliveries[0]?.quantityAsRecorded).toBe('84.03');
    expect(deliveries[0]?.unitAsRecorded).toBe('kL');
    expect(findings.map((f) => f.ruleCode)).toContain('FUEL_UNIT_KL');
  });

  it('normalises a spelling variant without changing the quantity', () => {
    const { deliveries, findings } = applyFuelRules([
      row(1, 'h1', 'INV-40624', 'Oct-25', '71053', 'litres', '132182.58'),
    ]);
    expect(deliveries[0]?.quantityLitres).toBe('71053');
    expect(findings.map((f) => f.ruleCode)).toContain('FUEL_UNIT_SPELLING');
  });

  it('keeps a negative delivery rather than rejecting it as invalid', () => {
    const { deliveries, findings } = applyFuelRules([
      row(1, 'h1', 'INV-41777', '11/02/2026', '-12500', 'L', '-23375.00'),
    ]);
    expect(deliveries[0]?.isNegativeAdjustment).toBe(true);
    expect(deliveries[0]?.quantityLitres).toBe('-12500');
    expect(findings.find((f) => f.ruleCode === 'FUEL_NEGATIVE_ACTIVITY')?.detail).toMatchObject({
      costAndQuantityAgree: true,
    });
  });

  it('does not mark a positive delivery as an adjustment', () => {
    const { deliveries } = applyFuelRules([row(1, 'h1', 'INV-1', '2025-04-01', '1000', 'L', '1850.00')]);
    expect(deliveries[0]?.isNegativeAdjustment).toBe(false);
  });

  // Date and cost parsing are covered above as functions. These name the rule
  // codes as well, so the catalogue and the tests cannot drift apart.
  it('raises a finding for each date and cost format it corrects', () => {
    const { findings } = applyFuelRules([
      row(1, 'h1', 'INV-1', '14/08/2025', '1000', 'L', '$1,850.00'),
    ]);
    const codes = findings.map((f) => f.ruleCode);
    expect(codes).toContain('FUEL_DATE_FORMAT');
    expect(codes).toContain('FUEL_COST_FORMAT');
  });

  it('flags a month-only date rather than inventing a day for it', () => {
    const { deliveries, findings } = applyFuelRules([
      row(1, 'h1', 'INV-1', 'Oct-25', '1000', 'L', '1850.00'),
    ]);
    expect(findings.map((f) => f.ruleCode)).toContain('FUEL_DATE_MONTH_ONLY');
    expect(deliveries[0]?.datePrecision).toBe('month');
    expect(deliveries[0]?.deliveryDate).toBe('2025-10-01');
  });

  it('marks the later copy of an identical row and keeps the first', () => {
    const { deliveries, findings } = applyFuelRules([
      row(1, 'same', 'INV-40266', '2025-05-02', '80000', 'L', '148000.00'),
      row(2, 'same', 'INV-40266', '2025-05-02', '80000', 'L', '148000.00'),
    ]);
    expect(deliveries[0]?.duplicateOfRowNumber).toBeNull();
    expect(deliveries[1]?.duplicateOfRowNumber).toBe(1);
    expect(findings.filter((f) => f.ruleCode === 'FUEL_EXACT_DUPLICATE')).toHaveLength(1);
  });

  it('does not treat two different deliveries as duplicates', () => {
    const { findings } = applyFuelRules([
      row(1, 'h1', 'INV-40266', '2025-05-02', '80000', 'L', '148000.00'),
      row(2, 'h2', 'INV-40267', '2025-05-02', '80000', 'L', '148000.00'),
    ]);
    expect(findings.filter((f) => f.ruleCode === 'FUEL_EXACT_DUPLICATE')).toHaveLength(0);
  });

  it('reports a month with no deliveries instead of letting it disappear', () => {
    const { findings } = applyFuelRules([
      row(1, 'h1', 'INV-1', '2025-10-14', '1000', 'L', '1850.00'),
      row(2, 'h2', 'INV-2', '2025-12-14', '1000', 'L', '1850.00'),
    ]);
    const gap = findings.find((f) => f.ruleCode === 'FUEL_MONTH_GAP');
    expect(gap?.sourceRowNumber).toBeNull();
    expect(gap?.detail).toMatchObject({ missingPeriods: ['2025-11'] });
  });

  it('says nothing about gaps when every month is present', () => {
    const { findings } = applyFuelRules([
      row(1, 'h1', 'INV-1', '2025-10-14', '1000', 'L', '1850.00'),
      row(2, 'h2', 'INV-2', '2025-11-14', '1000', 'L', '1850.00'),
    ]);
    expect(findings.filter((f) => f.ruleCode === 'FUEL_MONTH_GAP')).toHaveLength(0);
  });

  it('flags a price that disagrees with the rest of the file', () => {
    const normal = (n: number) =>
      row(n, `h${n}`, `INV-${n}`, '2025-04-01', '1000', 'L', '1850.00');
    const { findings } = applyFuelRules([
      normal(1),
      normal(2),
      normal(3),
      // Same quantity, cost off by a factor of ten: a plausible mis-key.
      row(4, 'h4', 'INV-4', '2025-04-02', '1000', 'L', '18500.00'),
    ]);
    expect(findings.find((f) => f.ruleCode === 'FUEL_PRICE_OUTLIER')?.sourceRowNumber).toBe(4);
  });

  it('does not flag the negative delivery as a price outlier', () => {
    // Its quantity and cost are both negative, so the implied price is normal.
    const normal = (n: number) =>
      row(n, `h${n}`, `INV-${n}`, '2025-04-01', '12500', 'L', '23375.00');
    const { findings } = applyFuelRules([
      normal(1),
      normal(2),
      normal(3),
      row(4, 'h4', 'INV-41777', '2025-04-02', '-12500', 'L', '-23375.00'),
    ]);
    expect(findings.filter((f) => f.ruleCode === 'FUEL_PRICE_OUTLIER')).toHaveLength(0);
  });

  it('reports headings that carry whitespace', () => {
    const { findings } = applyFuelRules(
      [row(1, 'h1', 'INV-1', '2025-04-01', '1000', 'L', '1850.00')],
      ['Invoice No', ' Delivery Date', 'Fuel Type ', 'Quantity', ' Unit'],
    );
    expect(findings.find((f) => f.ruleCode === 'FUEL_HEADER_WHITESPACE')?.detail).toMatchObject({
      headings: [' Delivery Date', 'Fuel Type ', ' Unit'],
    });
  });

  it('refuses to guess at a unit it does not recognise', () => {
    expect(() =>
      applyFuelRules([row(1, 'h1', 'INV-1', '2025-04-01', '100', 'gallons', '185.00')]),
    ).toThrow(/Unknown unit/);
  });

  it('refuses to guess at an unparseable date', () => {
    expect(() =>
      applyFuelRules([row(1, 'h1', 'INV-1', 'sometime in May', '100', 'L', '185.00')]),
    ).toThrow(/Unparseable delivery date/);
  });
});
