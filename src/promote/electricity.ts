// The recorded value and the corrected value both land on the row, along with
// the id of the adjustment that got from one to the other. That is what lets the
// API serve as-reported and corrected figures from the same rows, so the size of
// our own correction is visible rather than silently folded in.
import type { Tx } from '../db/client.js';
import { electricityReading } from '../db/schema.js';
import type { LandedFile } from '../ingest/land.js';
import { applyElectricityRules, type RawElectricityRow } from '../rules/electricity.js';
import { writeFindings, type PromotionSummary } from './findings.js';
import { resolveFactor, resolveSite, type ReferenceData } from './reference.js';

const DATASET = 'electricity_meter_readings';

export async function promoteElectricity(
  tx: Tx,
  ingestionRunId: number,
  landed: LandedFile,
  ref: ReferenceData,
): Promise<PromotionSummary> {
  const rawRows: RawElectricityRow[] = landed.rows.map((r) => ({
    rowNumber: r.rowNumber,
    meter_id: r.raw.meter_id ?? '',
    meter_description: r.raw.meter_description ?? '',
    period: r.raw.period ?? '',
    consumption: r.raw.consumption ?? '',
    unit: r.raw.unit ?? '',
  }));

  // The rules layer needs the bare labels, not the dataset-prefixed keys the
  // reference data is indexed by.
  const unmappedLabels = new Set(
    [...ref.unmappedLabels]
      .filter((k) => k.startsWith(`${DATASET}|`))
      .map((k) => k.slice(DATASET.length + 1)),
  );

  const { readings, findings } = applyElectricityRules(rawRows, {
    adjustments: ref.meterAdjustments,
    unmappedLabels,
  });

  const sourceRowIdByNumber = new Map(landed.rows.map((r) => [r.rowNumber, r.id]));
  const gridFactorId = resolveFactor(ref, 'grid_electricity_qld');

  const values = readings.map((r) => {
    const sourceRowId = sourceRowIdByNumber.get(r.rowNumber);
    if (sourceRowId === undefined) throw new Error(`No source row for reading ${r.rowNumber}`);
    return {
      sourceRowId,
      meterId: r.meterId,
      meterDescription: r.meterDescription,
      periodMonth: r.periodMonth,
      consumptionAsRecorded: r.consumptionAsRecorded,
      unitAsRecorded: r.unitAsRecorded,
      consumptionKwh: r.consumptionKwh,
      appliedAdjustmentId: r.appliedAdjustmentId,
      siteId: resolveSite(ref, DATASET, r.meterDescription),
      emissionFactorId: gridFactorId,
    };
  });

  let insertedCount = 0;
  for (let i = 0; i < values.length; i += 200) {
    const back = await tx
      .insert(electricityReading)
      .values(values.slice(i, i + 200))
      .returning({ id: electricityReading.id });
    insertedCount += back.length;
  }

  if (insertedCount !== readings.length) {
    throw new Error(`Promoted ${insertedCount} readings from ${readings.length} rows`);
  }

  return writeFindings(tx, ingestionRunId, landed, DATASET, findings);
}
