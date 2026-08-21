// Emissions are never stored, only computed: activity x the factor row recorded
// against it.
//
// Fuel and electricity each get their own subquery. Joining both to
// report_period in one go fans out - 10 deliveries x 6 readings = 60 rows - and
// inflates both scopes by different multiples.
import { sql } from 'drizzle-orm';
import type { Tx } from '../db/client.js';
import type { Basis, MonthlyEmissions } from '../contracts/index.js';

const KG_PER_TONNE = 1000;
const round1 = (n: number) => Math.round(n * 10) / 10;

interface MonthRow extends Record<string, unknown> {
  month: string;
  scope1_kg: string | null;
  scope2_corrected_kg: string | null;
  scope2_as_reported_kg: string | null;
  fuel_deliveries: number;
  meter_readings: number;
}

export async function monthlyEmissions(tx: Tx, basis: Basis): Promise<MonthlyEmissions> {
  const result = await tx.execute<MonthRow>(sql`
    select
      to_char(rp.period_month, 'YYYY-MM')            as month,
      f.kg                                           as scope1_kg,
      e.corrected_kg                                 as scope2_corrected_kg,
      e.as_reported_kg                               as scope2_as_reported_kg,
      coalesce(f.deliveries, 0)::int                 as fuel_deliveries,
      coalesce(e.readings, 0)::int                   as meter_readings
    from report_period rp
    left join (
      select date_trunc('month', fd.delivery_date)          as m,
             sum(fd.quantity_litres * ef.kg_co2e_per_unit)  as kg,
             count(*)                                       as deliveries
      from fuel_delivery fd
      join emission_factor ef on ef.id = fd.emission_factor_id
      -- duplicates stay in the table, out of the totals
      where fd.duplicate_of_id is null
      group by 1
    ) f on f.m = rp.period_month
    left join (
      select er.period_month                                        as m,
             sum(er.consumption_kwh * ef.kg_co2e_per_unit)          as corrected_kg,
             sum(er.consumption_as_recorded * ef.kg_co2e_per_unit)  as as_reported_kg,
             count(*)                                               as readings
      from electricity_reading er
      join emission_factor ef on ef.id = er.emission_factor_id
      group by 1
    ) e on e.m = rp.period_month
    order by rp.period_month
  `);

  const months = result.rows.map((r) => {
    const scope1 = Number(r.scope1_kg ?? 0) / KG_PER_TONNE;
    const scope2Kg = basis === 'corrected' ? r.scope2_corrected_kg : r.scope2_as_reported_kg;
    const scope2 = Number(scope2Kg ?? 0) / KG_PER_TONNE;
    // Sum of the rounded parts, not a rounded sum, so the columns add up on screen.
    const scope1Rounded = round1(scope1);
    const scope2Rounded = round1(scope2);
    return {
      month: r.month,
      scope1Tco2e: scope1Rounded,
      scope2Tco2e: scope2Rounded,
      totalTco2e: round1(scope1Rounded + scope2Rounded),
      fuelDeliveries: r.fuel_deliveries,
      meterReadings: r.meter_readings,
      hasFuelData: r.fuel_deliveries > 0,
      hasElectricityData: r.meter_readings > 0,
    };
  });

  const sum = (pick: (r: MonthRow) => string | null) =>
    result.rows.reduce((acc, r) => acc + Number(pick(r) ?? 0), 0) / KG_PER_TONNE;

  const scope1Total = sum((r) => r.scope1_kg);
  const scope2Corrected = sum((r) => r.scope2_corrected_kg);
  const scope2AsReported = sum((r) => r.scope2_as_reported_kg);
  const scope2Total = basis === 'corrected' ? scope2Corrected : scope2AsReported;

  return {
    basis,
    months,
    totals: {
      scope1Tco2e: round1(scope1Total),
      scope2Tco2e: round1(scope2Total),
      totalTco2e: round1(round1(scope1Total) + round1(scope2Total)),
    },
    correction: {
      scope2AsReportedTco2e: round1(scope2AsReported),
      scope2CorrectedTco2e: round1(scope2Corrected),
      // Rounded figures again, so it matches subtracting the two numbers shown.
      differenceTco2e: round1(round1(scope2Corrected) - round1(scope2AsReported)),
    },
    monthsWithoutFuelData: months.filter((m) => !m.hasFuelData).map((m) => m.month),
  };
}
