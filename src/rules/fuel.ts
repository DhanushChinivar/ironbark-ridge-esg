// The messiest file: 3 date formats, 4 spellings of 2 units, 2 cost formats,
// 7 byte-identical duplicates, a negative delivery, and a month with nothing in it.
import { finding, type Finding } from './finding.js';

export interface RawFuelRow {
  rowNumber: number;
  rowHash: string;
  invoice_no: string;
  delivery_date: string;
  fuel_type: string;
  quantity: string;
  unit: string;
  cost: string;
  site_area: string;
}

export interface CleanFuelDelivery {
  rowNumber: number;
  invoiceNo: string;
  deliveryDate: string;
  deliveryDateRaw: string;
  datePrecision: 'day' | 'month';
  fuelTypeRaw: string;
  fuelTypeNormalised: string;
  quantityAsRecorded: string;
  unitAsRecorded: string;
  quantityLitres: string;
  costAud: string | null;
  siteArea: string;
  isCreditNote: boolean;
  /** Row number of the first occurrence; null when this row is the first. */
  duplicateOfRowNumber: number | null;
}

export interface FuelRuleResult {
  deliveries: CleanFuelDelivery[];
  findings: Finding[];
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// Litres per unit, keyed by the lower-cased spelling as it appears in the file.
const UNITS: Record<string, number> = {
  l: 1,
  litre: 1,
  litres: 1,
  kl: 1000,
  kilolitre: 1000,
  kilolitres: 1000,
};

const FUEL_TYPES: [RegExp, string][] = [
  [/diesel/i, 'diesel'],
  [/petrol|ulp/i, 'petrol'],
];

// Against the file's own median, not a hardcoded band, so it survives fuel prices
// moving. Widest deviation in this file is 7%, so it fires on nothing.
const PRICE_TOLERANCE = 0.15;

export interface ParsedDate {
  date: string;
  precision: 'day' | 'month';
}

// Slash dates are day-first. Not an assumption: 66 rows have a first component
// above 12 and none has a second above 12, so month-first is impossible here.
//
// Mon-YY has no day. Dated to the 1st and marked month-precision rather than
// inventing one - monthly totals stay right, the imprecision stays visible.
export function parseDeliveryDate(raw: string): ParsedDate | null {
  const s = raw.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return { date: s, precision: 'day' };

  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (slash) {
    const [, d, m, y] = slash;
    return { date: `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`, precision: 'day' };
  }

  const monYy = /^([A-Za-z]{3})-(\d{2})$/.exec(s);
  if (monYy) {
    const month = MONTHS.indexOf(monYy[1]!.toLowerCase());
    if (month === -1) return null;
    return { date: `20${monYy[2]}-${String(month + 1).padStart(2, '0')}-01`, precision: 'month' };
  }

  return null;
}

export function litresPerUnit(unit: string): number | null {
  return UNITS[unit.trim().toLowerCase()] ?? null;
}

export function normaliseFuelType(fuelType: string): string | null {
  return FUEL_TYPES.find(([re]) => re.test(fuelType))?.[1] ?? null;
}

export function parseCost(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function applyFuelRules(rows: RawFuelRow[], rawHeaders: string[] = []): FuelRuleResult {
  const findings: Finding[] = [];
  const deliveries: CleanFuelDelivery[] = [];
  const firstSeenByHash = new Map<string, number>();

  const untrimmed = rawHeaders.filter((h) => h !== h.trim());
  if (untrimmed.length) {
    findings.push(
      finding('FUEL_HEADER_WHITESPACE', null, {
        detail: { headings: untrimmed, trimmedTo: untrimmed.map((h) => h.trim()) },
      }),
    );
  }

  for (const r of rows) {
    const parsedDate = parseDeliveryDate(r.delivery_date);
    if (!parsedDate) {
      throw new Error(`Unparseable delivery date on row ${r.rowNumber}: "${r.delivery_date}"`);
    }
    if (r.delivery_date.trim() !== parsedDate.date) {
      findings.push(
        finding('FUEL_DATE_FORMAT', r.rowNumber, {
          field: 'Delivery Date',
          originalValue: r.delivery_date,
          correctedValue: parsedDate.date,
        }),
      );
    }
    if (parsedDate.precision === 'month') {
      findings.push(
        finding('FUEL_DATE_MONTH_ONLY', r.rowNumber, {
          field: 'Delivery Date',
          originalValue: r.delivery_date,
          correctedValue: parsedDate.date,
          detail: { precision: 'month', datedToFirstOfMonth: true },
        }),
      );
    }

    const multiplier = litresPerUnit(r.unit);
    if (multiplier === null) throw new Error(`Unknown unit on row ${r.rowNumber}: "${r.unit}"`);

    const quantity = Number(r.quantity);
    if (!Number.isFinite(quantity)) {
      throw new Error(`Unparseable quantity on row ${r.rowNumber}: "${r.quantity}"`);
    }
    const litres = quantity * multiplier;

    if (multiplier !== 1) {
      findings.push(
        finding('FUEL_UNIT_KL', r.rowNumber, {
          field: 'Unit',
          originalValue: `${r.quantity} ${r.unit}`,
          correctedValue: `${litres} L`,
          detail: { multiplier },
        }),
      );
    } else if (r.unit.trim() !== 'L') {
      findings.push(
        finding('FUEL_UNIT_SPELLING', r.rowNumber, {
          field: 'Unit',
          originalValue: r.unit,
          correctedValue: 'L',
        }),
      );
    }

    const fuelType = normaliseFuelType(r.fuel_type);
    if (!fuelType) throw new Error(`Unknown fuel type on row ${r.rowNumber}: "${r.fuel_type}"`);

    const cost = parseCost(r.cost);
    if (cost !== null && /[$,]/.test(r.cost)) {
      findings.push(
        finding('FUEL_COST_FORMAT', r.rowNumber, {
          field: 'Cost (AUD)',
          originalValue: r.cost,
          correctedValue: cost.toFixed(2),
        }),
      );
    }

    const isCreditNote = litres < 0;
    if (isCreditNote) {
      findings.push(
        finding('FUEL_CREDIT_NOTE', r.rowNumber, {
          field: 'Quantity',
          originalValue: `${r.quantity} ${r.unit}`,
          detail: {
            invoiceNo: r.invoice_no,
            litres,
            costAud: cost,
            // Both negative and consistent is what separates a reversal from a typo.
            costAndQuantityAgree: cost !== null && cost < 0,
          },
        }),
      );
    }

    const firstSeen = firstSeenByHash.get(r.rowHash);
    if (firstSeen === undefined) {
      firstSeenByHash.set(r.rowHash, r.rowNumber);
    } else {
      findings.push(
        finding('FUEL_EXACT_DUPLICATE', r.rowNumber, {
          field: 'Invoice No',
          originalValue: r.invoice_no,
          detail: {
            businessKey: r.invoice_no,
            duplicateOfRowNumber: firstSeen,
            fieldsCompared: ['Invoice No', 'Delivery Date', 'Fuel Type', 'Quantity', 'Unit', 'Cost (AUD)', 'Site Area'],
          },
        }),
      );
    }

    deliveries.push({
      rowNumber: r.rowNumber,
      invoiceNo: r.invoice_no,
      deliveryDate: parsedDate.date,
      deliveryDateRaw: r.delivery_date,
      datePrecision: parsedDate.precision,
      fuelTypeRaw: r.fuel_type,
      fuelTypeNormalised: fuelType,
      quantityAsRecorded: quantity.toString(),
      unitAsRecorded: r.unit,
      quantityLitres: litres.toString(),
      costAud: cost === null ? null : cost.toFixed(2),
      siteArea: r.site_area,
      isCreditNote,
      duplicateOfRowNumber: firstSeen ?? null,
    });
  }

  flagPriceOutliers(deliveries, findings);
  flagMissingMonths(deliveries, findings);
  return { deliveries, findings };
}

function flagPriceOutliers(deliveries: CleanFuelDelivery[], findings: Finding[]): void {
  const priced = deliveries.filter((d) => d.costAud !== null && Number(d.quantityLitres) !== 0);
  if (priced.length < 3) return;

  const prices = priced.map((d) => Math.abs(Number(d.costAud)) / Math.abs(Number(d.quantityLitres)));
  const mid = median(prices);

  priced.forEach((d, i) => {
    const price = prices[i]!;
    const deviation = Math.abs(price - mid) / mid;
    if (deviation <= PRICE_TOLERANCE) return;
    findings.push(
      finding('FUEL_PRICE_OUTLIER', d.rowNumber, {
        field: 'Cost (AUD)',
        originalValue: d.costAud ?? '',
        detail: {
          impliedPricePerLitre: Number(price.toFixed(4)),
          medianPricePerLitre: Number(mid.toFixed(4)),
          deviationPercent: Number((deviation * 100).toFixed(1)),
          tolerancePercent: PRICE_TOLERANCE * 100,
        },
      }),
    );
  });
}

// No deliveries is not the same as no diesel burned. File-level so the gap gets
// stated rather than implied by a missing bar on a chart.
function flagMissingMonths(deliveries: CleanFuelDelivery[], findings: Finding[]): void {
  const months = new Set(deliveries.map((d) => d.deliveryDate.slice(0, 7)));
  const sorted = [...months].sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return;

  const expected: string[] = [];
  const [fy, fm] = first.split('-').map(Number) as [number, number];
  const [ly, lm] = last.split('-').map(Number) as [number, number];
  for (let y = fy, m = fm; y < ly || (y === ly && m <= lm); m === 12 ? ((y += 1), (m = 1)) : (m += 1)) {
    expected.push(`${y}-${String(m).padStart(2, '0')}`);
  }

  const missing = expected.filter((m) => !months.has(m));
  if (!missing.length) return;

  findings.push(
    finding('FUEL_MONTH_GAP', null, {
      detail: {
        dataset: 'fuel_deliveries',
        missingPeriods: missing,
        periodsExpected: expected.length,
        periodsPresent: months.size,
      },
    }),
  );
}
