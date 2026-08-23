// The arithmetic behind one month, unrolled. monthlyEmissions aggregates in
// SQL; this returns the rows that aggregation summed, so a reader can add them
// up themselves. Both read the same tables and the same factors, and the API
// returns both figures side by side rather than asking anyone to assume they
// agree.
import { sql } from 'drizzle-orm';
import type { Tx } from '../db/client.js';
import type { Basis, EmissionsCalculation, CalculationLine } from '../contracts/index.js';
import { monthlyEmissions } from './emissions.js';

interface LineRow extends Record<string, unknown> {
  source_file: string;
  source_row_number: number;
  reference: string;
  as_recorded: string;
  quantity: string;
  quantity_unit: string;
  factor_activity: string;
  factor_per_unit: string;
  kg_co2e: string;
  changed: boolean;
  excluded_because: string | null;
}

const toLine = (r: LineRow): CalculationLine => ({
  sourceFile: r.source_file,
  sourceRowNumber: r.source_row_number,
  reference: r.reference,
  asRecorded: r.as_recorded,
  quantity: Number(r.quantity),
  quantityUnit: r.quantity_unit,
  factorActivity: r.factor_activity,
  factorPerUnit: Number(r.factor_per_unit),
  kgCo2e: Number(r.kg_co2e),
  changed: r.changed,
  excludedBecause: r.excluded_because,
});

const round1 = (n: number) => Math.round(n * 10) / 10;

export async function emissionsCalculation(
  tx: Tx,
  month: string,
  basis: Basis,
): Promise<EmissionsCalculation> {
  const firstOfMonth = `${month}-01`;

  // Duplicates are listed, not hidden: a reader can see the row exists and see
  // that it was left out. Same for the credit note, which subtracts.
  const fuel = await tx.execute<LineRow>(sql`
    select 'fuel_deliveries.csv'                       as source_file,
           sr.row_number                               as source_row_number,
           fd.invoice_no                               as reference,
           fd.quantity_as_recorded || ' ' || fd.unit_as_recorded as as_recorded,
           fd.quantity_litres                          as quantity,
           'L'                                         as quantity_unit,
           ef.activity                                 as factor_activity,
           ef.kg_co2e_per_unit                         as factor_per_unit,
           fd.quantity_litres * ef.kg_co2e_per_unit    as kg_co2e,
           fd.quantity_as_recorded <> fd.quantity_litres as changed,
           case when fd.duplicate_of_id is not null
                then 'exact duplicate of an earlier invoice'
           end                                         as excluded_because
    from fuel_delivery fd
    join source_row sr on sr.id = fd.source_row_id
    join emission_factor ef on ef.id = fd.emission_factor_id
    where date_trunc('month', fd.delivery_date) = ${firstOfMonth}::date
    order by sr.row_number
  `);

  // as_recorded keeps the number the file stated; quantity is what was used.
  // On the corrected basis those differ wherever MTR-07 was rescaled.
  const consumption = basis === 'corrected' ? sql`er.consumption_kwh` : sql`er.consumption_as_recorded`;
  const electricity = await tx.execute<LineRow>(sql`
    select 'electricity_meter_readings.csv'            as source_file,
           sr.row_number                               as source_row_number,
           er.meter_id                                 as reference,
           er.consumption_as_recorded || ' ' || er.unit_as_recorded as as_recorded,
           ${consumption}                              as quantity,
           'kWh'                                       as quantity_unit,
           ef.activity                                 as factor_activity,
           ef.kg_co2e_per_unit                         as factor_per_unit,
           ${consumption} * ef.kg_co2e_per_unit        as kg_co2e,
           er.consumption_as_recorded <> ${consumption} as changed,
           null::text                                  as excluded_because
    from electricity_reading er
    join source_row sr on sr.id = er.source_row_id
    join emission_factor ef on ef.id = er.emission_factor_id
    where er.period_month = ${firstOfMonth}::date
    order by er.meter_id
  `);

  const build = (scope: number, label: string, rows: LineRow[]) => {
    const lines = rows.map(toLine);
    const counted = lines.filter((l) => l.excludedBecause === null);
    const subtotalKg = counted.reduce((a, l) => a + l.kgCo2e, 0);
    return {
      scope,
      label,
      lines,
      countedLines: counted.length,
      subtotalKgCo2e: Math.round(subtotalKg),
      subtotalTco2e: round1(subtotalKg / 1000),
    };
  };

  const scopes = [
    build(1, 'Fuel deliveries', fuel.rows),
    build(2, 'Metered electricity', electricity.rows),
  ];

  const monthly = await monthlyEmissions(tx, basis);
  const reported = monthly.months.find((m) => m.month === month);

  return {
    month,
    basis,
    scopes,
    // Summed from the rounded subtotals, the same way the monthly figures are,
    // so the two totals are comparable without a rounding gap of their own.
    totalTco2e: round1(scopes.reduce((a, s) => a + s.subtotalTco2e, 0)),
    reported: {
      scope1Tco2e: reported?.scope1Tco2e ?? 0,
      scope2Tco2e: reported?.scope2Tco2e ?? 0,
      totalTco2e: reported?.totalTco2e ?? 0,
    },
    availableMonths: monthly.months.map((m) => m.month),
  };
}
