// Resolves each row's site and emission factor as it lands. Recording which
// factor row was applied means a later factor correction cannot silently
// rewrite a figure that has already been reported.
import { sql } from 'drizzle-orm';
import type { Tx } from '../db/client.js';
import { fuelDelivery } from '../db/schema.js';
import type { LandedFile } from '../ingest/land.js';
import { applyFuelRules, type RawFuelRow } from '../rules/fuel.js';
import { writeFindings, type PromotionSummary } from './findings.js';
import { resolveFactor, resolveSite, type ReferenceData } from './reference.js';

export async function promoteFuel(
  tx: Tx,
  ingestionRunId: number,
  landed: LandedFile,
  ref: ReferenceData,
): Promise<PromotionSummary> {
  const rawRows: RawFuelRow[] = landed.rows.map((r) => ({
    rowNumber: r.rowNumber,
    rowHash: r.rowHash,
    invoice_no: r.raw['Invoice No'] ?? '',
    delivery_date: r.raw['Delivery Date'] ?? '',
    fuel_type: r.raw['Fuel Type'] ?? '',
    quantity: r.raw.Quantity ?? '',
    unit: r.raw.Unit ?? '',
    cost: r.raw['Cost (AUD)'] ?? '',
    site_area: r.raw['Site Area'] ?? '',
  }));

  const { deliveries, findings } = applyFuelRules(rawRows, landed.rawHeaders);
  const sourceRowIdByNumber = new Map(landed.rows.map((r) => [r.rowNumber, r.id]));

  const inserted = await tx
    .insert(fuelDelivery)
    .values(
      deliveries.map((d) => {
        const sourceRowId = sourceRowIdByNumber.get(d.rowNumber);
        if (sourceRowId === undefined) throw new Error(`No source row for delivery ${d.rowNumber}`);
        return {
          sourceRowId,
          invoiceNo: d.invoiceNo,
          deliveryDate: d.deliveryDate,
          deliveryDateRaw: d.deliveryDateRaw,
          datePrecision: d.datePrecision,
          fuelTypeRaw: d.fuelTypeRaw,
          fuelTypeNormalised: d.fuelTypeNormalised,
          quantityAsRecorded: d.quantityAsRecorded,
          unitAsRecorded: d.unitAsRecorded,
          quantityLitres: d.quantityLitres,
          costAud: d.costAud,
          siteArea: d.siteArea,
          siteId: resolveSite(ref, 'fuel_deliveries', d.siteArea),
          emissionFactorId: resolveFactor(ref, d.fuelTypeNormalised),
          isNegativeAdjustment: d.isNegativeAdjustment,
        };
      }),
    )
    .returning({ id: fuelDelivery.id, sourceRowId: fuelDelivery.sourceRowId });

  if (inserted.length !== deliveries.length) {
    throw new Error(`Promoted ${inserted.length} deliveries from ${deliveries.length} rows`);
  }

  // Same second pass as suppliers: a row cannot point at another row until
  // every row has an id.
  const idBySourceRowId = new Map(inserted.map((d) => [d.sourceRowId, d.id]));
  const idByRowNumber = new Map(landed.rows.map((r) => [r.rowNumber, idBySourceRowId.get(r.id)]));

  const links: [number, number][] = [];
  for (const d of deliveries) {
    if (d.duplicateOfRowNumber === null) continue;
    const self = idByRowNumber.get(d.rowNumber);
    const original = idByRowNumber.get(d.duplicateOfRowNumber);
    if (self === undefined || original === undefined) {
      throw new Error(`Cannot link duplicate row ${d.rowNumber} to ${d.duplicateOfRowNumber}`);
    }
    links.push([self, original]);
  }

  if (links.length) {
    const pairs = sql.join(
      links.map(([self, original]) => sql`(${self}::int, ${original}::int)`),
      sql`, `,
    );
    await tx.execute(sql`
      update ${fuelDelivery} as f
         set duplicate_of_id = v.original
        from (values ${pairs}) as v(self, original)
       where f.id = v.self
    `);
  }

  return writeFindings(tx, ingestionRunId, landed, 'fuel_deliveries', findings);
}
