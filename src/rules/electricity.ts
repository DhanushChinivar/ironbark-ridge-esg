// Structurally the cleanest of the four files: six meters, eighteen months each,
// no missing periods, no duplicates, one unit spelling. What it hides is worse
// than anything in the fuel file - MTR-07 starts reporting megawatt-hours in
// October 2025 while still labelled kWh, and never recovers.
//
// The corrections themselves live in the database, not here. This function is
// handed them as data so it stays pure and testable.
import { finding, type Finding } from './finding.js';

export interface RawElectricityRow {
  rowNumber: number;
  meter_id: string;
  meter_description: string;
  period: string;
  consumption: string;
  unit: string;
}

export interface MeterAdjustment {
  id: number;
  meterId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  multiplier: number;
}

export interface CleanElectricityReading {
  rowNumber: number;
  meterId: string;
  meterDescription: string;
  periodMonth: string;
  consumptionAsRecorded: string;
  unitAsRecorded: string;
  consumptionKwh: string;
  appliedAdjustmentId: number | null;
}

export interface ElectricityRuleInput {
  adjustments: MeterAdjustment[];
  /** Meter descriptions the seed declared as not attributable to a site. */
  unmappedLabels: Set<string>;
}

export interface ElectricityRuleResult {
  readings: CleanElectricityReading[];
  findings: Finding[];
}

const KWH_PER_UNIT: Record<string, number> = { kwh: 1, mwh: 1000 };
const GRID_FACTOR_KG_PER_KWH = 0.71;

export function parsePeriod(raw: string): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return `${m[1]}-${m[2]}-01`;
}

export function kwhPerUnit(unit: string): number | null {
  return KWH_PER_UNIT[unit.trim().toLowerCase()] ?? null;
}

// Ranges are half-open: [from, to).
export function adjustmentFor(
  adjustments: MeterAdjustment[],
  meterId: string,
  periodMonth: string,
): MeterAdjustment | null {
  return (
    adjustments.find(
      (a) =>
        a.meterId === meterId &&
        periodMonth >= a.effectiveFrom &&
        (a.effectiveTo === null || periodMonth < a.effectiveTo),
    ) ?? null
  );
}

export function applyElectricityRules(
  rows: RawElectricityRow[],
  input: ElectricityRuleInput,
): ElectricityRuleResult {
  const findings: Finding[] = [];
  const readings: CleanElectricityReading[] = [];

  for (const r of rows) {
    const periodMonth = parsePeriod(r.period);
    if (!periodMonth) throw new Error(`Unparseable period on row ${r.rowNumber}: "${r.period}"`);

    const unitFactor = kwhPerUnit(r.unit);
    if (unitFactor === null) throw new Error(`Unknown unit on row ${r.rowNumber}: "${r.unit}"`);

    const recorded = Number(r.consumption.replace(/,/g, ''));
    if (!Number.isFinite(recorded)) {
      throw new Error(`Unparseable consumption on row ${r.rowNumber}: "${r.consumption}"`);
    }

    const adjustment = adjustmentFor(input.adjustments, r.meter_id, periodMonth);
    const multiplier = adjustment?.multiplier ?? 1;
    const kwh = recorded * unitFactor * multiplier;

    if (adjustment) {
      findings.push(
        finding('ELEC_UNIT_SCALE_BREAK', r.rowNumber, {
          field: 'consumption',
          originalValue: `${recorded} ${r.unit}`,
          correctedValue: `${kwh} kWh`,
          detail: {
            meterId: r.meter_id,
            periodMonth,
            multiplierApplied: multiplier,
            adjustmentId: adjustment.id,
          },
        }),
      );
    }

    readings.push({
      rowNumber: r.rowNumber,
      meterId: r.meter_id,
      meterDescription: r.meter_description,
      periodMonth,
      consumptionAsRecorded: recorded.toString(),
      unitAsRecorded: r.unit,
      consumptionKwh: kwh.toString(),
      appliedAdjustmentId: adjustment?.id ?? null,
    });
  }

  flagMeterIdGap(readings, findings);
  flagUnmappableMeters(readings, input.unmappedLabels, findings);
  return { readings, findings };
}

// MTR-06 is absent from an otherwise complete sequence, and every meter that
// does appear covers all eighteen months. The impact is deliberately not
// asserted: the meter may have been decommissioned rather than omitted, so the
// finding carries a scale estimate marked illustrative and leaves the question
// to the site.
function flagMeterIdGap(readings: CleanElectricityReading[], findings: Finding[]): void {
  const meters = [...new Set(readings.map((r) => r.meterId))].sort();
  const numbers = meters.map((m) => Number(/(\d+)$/.exec(m)?.[1])).filter((n) => Number.isFinite(n));
  if (numbers.length < 2) return;

  const lo = Math.min(...numbers);
  const hi = Math.max(...numbers);
  const prefix = meters[0]!.replace(/\d+$/, '');
  const missing: string[] = [];
  for (let n = lo; n <= hi; n += 1) {
    if (!numbers.includes(n)) missing.push(`${prefix}${String(n).padStart(2, '0')}`);
  }
  if (!missing.length) return;

  const monthsPerMeter = new Map<string, number>();
  for (const r of readings) monthsPerMeter.set(r.meterId, (monthsPerMeter.get(r.meterId) ?? 0) + 1);
  const coverage = [...new Set(monthsPerMeter.values())];

  // Median rather than mean: one meter is four times the size of the others, and
  // a mean would make the estimate look larger than it should.
  const totals = meters.map((m) =>
    readings.filter((r) => r.meterId === m).reduce((sum, r) => sum + Number(r.consumptionKwh), 0),
  );
  const sorted = [...totals].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianTotal = sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;

  for (const meterId of missing) {
    findings.push(
      finding('ELEC_METER_ID_GAP', null, {
        field: 'meter_id',
        detail: {
          missingMeterId: meterId,
          observedRange: [
            `${prefix}${String(lo).padStart(2, '0')}`,
            `${prefix}${String(hi).padStart(2, '0')}`,
          ],
          presentMeters: meters,
          coverageMonthsEach: coverage.length === 1 ? coverage[0] : coverage,
          impactTco2e: {
            value: Math.round((medianTotal * GRID_FACTOR_KG_PER_KWH) / 1000 / 100) * 100,
            basis:
              'A meter of median size across the same window, at 0.71 kg CO2e/kWh. ' +
              'The meter may have been decommissioned rather than omitted.',
            isIllustrative: true,
          },
        },
      }),
    );
  }
}

// Reported once per meter rather than once per reading, which would bury the
// point under ninety identical findings.
function flagUnmappableMeters(
  readings: CleanElectricityReading[],
  unmappedLabels: Set<string>,
  findings: Finding[],
): void {
  const seen = new Set<string>();
  for (const r of readings) {
    if (seen.has(r.meterId)) continue;
    if (!unmappedLabels.has(r.meterDescription)) continue;
    seen.add(r.meterId);
    findings.push(
      finding('ELEC_SITE_UNMAPPED', null, {
        field: 'meter_description',
        originalValue: r.meterDescription,
        detail: {
          meterId: r.meterId,
          meterDescription: r.meterDescription,
          readingsAffected: readings.filter((x) => x.meterId === r.meterId).length,
        },
      }),
    );
  }
}
