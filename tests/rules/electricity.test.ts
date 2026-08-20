import { describe, expect, it } from 'vitest';
import {
  adjustmentFor,
  applyElectricityRules,
  kwhPerUnit,
  parsePeriod,
  type MeterAdjustment,
  type RawElectricityRow,
} from '../../src/rules/electricity.js';

// The MTR-07 correction as seeded: open-ended, because the fault never resolves.
const MTR07_FIX: MeterAdjustment = {
  id: 1,
  meterId: 'MTR-07',
  effectiveFrom: '2025-10-01',
  effectiveTo: null,
  multiplier: 1000,
};

const row = (
  rowNumber: number,
  meter_id: string,
  meter_description: string,
  period: string,
  consumption: string,
): RawElectricityRow => ({
  rowNumber,
  meter_id,
  meter_description,
  period,
  consumption,
  unit: 'kWh',
});

const withFix = { adjustments: [MTR07_FIX], unmappedLabels: new Set<string>() };
const sixMeters = ['MTR-01', 'MTR-02', 'MTR-03', 'MTR-04', 'MTR-05', 'MTR-07'];

describe('parsePeriod', () => {
  it('dates a period to the first of its month', () => {
    expect(parsePeriod('2025-01')).toBe('2025-01-01');
  });

  it('rejects an impossible month rather than rolling it over', () => {
    expect(parsePeriod('2025-13')).toBeNull();
    expect(parsePeriod('2025-00')).toBeNull();
  });

  it('rejects a format it does not recognise', () => {
    expect(parsePeriod('Jan 2025')).toBeNull();
  });
});

describe('kwhPerUnit', () => {
  it('knows both units, so a relabelled meter would be handled', () => {
    expect(kwhPerUnit('kWh')).toBe(1);
    expect(kwhPerUnit('MWh')).toBe(1000);
  });

  it('returns null for anything else', () => {
    expect(kwhPerUnit('therms')).toBeNull();
  });
});

describe('adjustmentFor', () => {
  it('does not apply before the fault begins', () => {
    expect(adjustmentFor([MTR07_FIX], 'MTR-07', '2025-09-01')).toBeNull();
  });

  it('applies from the month the fault begins', () => {
    expect(adjustmentFor([MTR07_FIX], 'MTR-07', '2025-10-01')).toBe(MTR07_FIX);
  });

  it('keeps applying, because the fault is unresolved in the last reading', () => {
    expect(adjustmentFor([MTR07_FIX], 'MTR-07', '2026-06-01')).toBe(MTR07_FIX);
  });

  it('does not touch other meters', () => {
    expect(adjustmentFor([MTR07_FIX], 'MTR-01', '2026-01-01')).toBeNull();
  });

  it('stops at effective_to when a correction does end', () => {
    const bounded = { ...MTR07_FIX, effectiveTo: '2026-01-01' };
    expect(adjustmentFor([bounded], 'MTR-07', '2025-12-01')).toBe(bounded);
    expect(adjustmentFor([bounded], 'MTR-07', '2026-01-01')).toBeNull();
  });
});

describe('applyElectricityRules', () => {
  it('leaves readings before the fault untouched', () => {
    const { readings, findings } = applyElectricityRules(
      [row(1, 'MTR-07', 'Ventilation & Dewatering', '2025-09', '274790.9')],
      withFix,
    );
    expect(readings[0]?.consumptionKwh).toBe('274790.9');
    expect(readings[0]?.appliedAdjustmentId).toBeNull();
    expect(findings).toHaveLength(0);
  });

  it('scales a broken reading back up and records the correction', () => {
    const { readings, findings } = applyElectricityRules(
      [row(1, 'MTR-07', 'Ventilation & Dewatering', '2025-10', '277')],
      withFix,
    );
    expect(readings[0]?.consumptionAsRecorded).toBe('277');
    expect(readings[0]?.consumptionKwh).toBe('277000');
    expect(readings[0]?.appliedAdjustmentId).toBe(1);
    const fix = findings.find((f) => f.ruleCode === 'ELEC_UNIT_SCALE_BREAK');
    expect(fix?.originalValue).toBe('277 kWh');
    expect(fix?.correctedValue).toBe('277000 kWh');
  });

  it('keeps the recorded value alongside the corrected one', () => {
    const { readings } = applyElectricityRules(
      [row(1, 'MTR-07', 'Ventilation & Dewatering', '2026-03', '85.1')],
      withFix,
    );
    // March 2026 is genuinely low: the grid was down. The correction restores
    // the scale without hiding the drop.
    expect(readings[0]?.consumptionAsRecorded).toBe('85.1');
    expect(readings[0]?.consumptionKwh).toBe('85100');
  });

  it('corrects nothing when no adjustment is seeded', () => {
    const { readings, findings } = applyElectricityRules(
      [row(1, 'MTR-07', 'Ventilation & Dewatering', '2025-10', '277')],
      { adjustments: [], unmappedLabels: new Set() },
    );
    expect(readings[0]?.consumptionKwh).toBe('277');
    expect(findings.filter((f) => f.ruleCode === 'ELEC_UNIT_SCALE_BREAK')).toHaveLength(0);
  });

  it('reports a meter missing from an otherwise complete sequence', () => {
    const rows = sixMeters.map((m, i) => row(i + 1, m, 'Something', '2025-01', '100000'));
    const gap = applyElectricityRules(rows, withFix).findings.find(
      (f) => f.ruleCode === 'ELEC_METER_ID_GAP',
    );
    expect(gap?.sourceRowNumber).toBeNull();
    expect(gap?.detail).toMatchObject({ missingMeterId: 'MTR-06', coverageMonthsEach: 1 });
  });

  it('marks the missing meter estimate as illustrative, not measured', () => {
    const rows = sixMeters.map((m, i) => row(i + 1, m, 'Something', '2025-01', '100000'));
    const gap = applyElectricityRules(rows, withFix).findings.find(
      (f) => f.ruleCode === 'ELEC_METER_ID_GAP',
    );
    const detail = gap?.detail as { impactTco2e: { isIllustrative: boolean; value: number } };
    expect(detail.impactTco2e.isIllustrative).toBe(true);
    expect(typeof detail.impactTco2e.value).toBe('number');
  });

  it('says nothing about a gap when the sequence is complete', () => {
    const rows = ['MTR-01', 'MTR-02', 'MTR-03'].map((m, i) =>
      row(i + 1, m, 'Something', '2025-01', '100000'),
    );
    const { findings } = applyElectricityRules(rows, withFix);
    expect(findings.filter((f) => f.ruleCode === 'ELEC_METER_ID_GAP')).toHaveLength(0);
  });

  it('reports an unmappable meter once, not once per reading', () => {
    const rows = ['2025-01', '2025-02', '2025-03'].map((p, i) =>
      row(i + 1, 'MTR-02', 'CHPP Conveyors', p, '410000'),
    );
    const unmapped = applyElectricityRules(rows, {
      adjustments: [],
      unmappedLabels: new Set(['CHPP Conveyors']),
    }).findings.filter((f) => f.ruleCode === 'ELEC_SITE_UNMAPPED');
    expect(unmapped).toHaveLength(1);
    expect(unmapped[0]?.detail).toMatchObject({ readingsAffected: 3 });
  });

  it('says nothing about a meter that does map to a site', () => {
    const { findings } = applyElectricityRules(
      [row(1, 'MTR-01', 'Processing Plant', '2025-01', '1029974.7')],
      { adjustments: [], unmappedLabels: new Set(['CHPP Conveyors']) },
    );
    expect(findings.filter((f) => f.ruleCode === 'ELEC_SITE_UNMAPPED')).toHaveLength(0);
  });

  it('refuses to guess at a unit it does not recognise', () => {
    const bad = { ...row(1, 'MTR-01', 'Processing Plant', '2025-01', '100'), unit: 'therms' };
    expect(() => applyElectricityRules([bad], withFix)).toThrow(/Unknown unit/);
  });

  it('refuses to guess at an unparseable period', () => {
    expect(() =>
      applyElectricityRules([row(1, 'MTR-01', 'Processing Plant', 'Jan 2025', '100')], withFix),
    ).toThrow(/Unparseable period/);
  });
});
