// Two passes: a supplier points at another supplier, so nothing can be linked
// until every row has an id.
import { sql } from 'drizzle-orm';
import type { Tx } from '../db/client.js';
import { supplier } from '../db/schema.js';
import type { LandedFile } from '../ingest/land.js';
import { applySupplierRules, type RawSupplierRow } from '../rules/suppliers.js';
import { writeFindings, type PromotionSummary } from './findings.js';

export async function promoteSuppliers(
  tx: Tx,
  ingestionRunId: number,
  landed: LandedFile,
): Promise<PromotionSummary> {
  const rawRows: RawSupplierRow[] = landed.rows.map((r) => ({
    rowNumber: r.rowNumber,
    supplier_name: r.raw.supplier_name ?? '',
    abn: r.raw.abn ?? '',
    category: r.raw.category ?? '',
    fy_spend_aud: r.raw.fy_spend_aud ?? '',
  }));

  const { suppliers, findings } = applySupplierRules(rawRows);
  const sourceRowIdByNumber = new Map(landed.rows.map((r) => [r.rowNumber, r.id]));

  const inserted = await tx
    .insert(supplier)
    .values(
      suppliers.map((s) => {
        const sourceRowId = sourceRowIdByNumber.get(s.rowNumber);
        if (sourceRowId === undefined) throw new Error(`No source row for supplier ${s.rowNumber}`);
        return {
          sourceRowId,
          nameRaw: s.nameRaw,
          nameNormalised: s.nameNormalised,
          abnRaw: s.abnRaw,
          abnDigits: s.abnDigits,
          abnFormatValid: s.abnFormatValid,
          categoryRaw: s.categoryRaw,
          categoryNormalised: s.categoryNormalised,
          fySpendAud: s.fySpendAud,
          matchMethod: s.matchMethod,
        };
      }),
    )
    .returning({ id: supplier.id, sourceRowId: supplier.sourceRowId });

  // Catches a dropped insert before the counters do.
  if (inserted.length !== suppliers.length) {
    throw new Error(`Promoted ${inserted.length} suppliers from ${suppliers.length} rows`);
  }

  // file position -> source row id -> supplier id
  const supplierIdBySourceRowId = new Map(inserted.map((s) => [s.sourceRowId, s.id]));
  const supplierIdByRowNumber = new Map(
    landed.rows.map((r) => [r.rowNumber, supplierIdBySourceRowId.get(r.id)]),
  );

  // All the links in one statement rather than a round trip each.
  const links: [number, number][] = [];
  for (const s of suppliers) {
    if (s.canonicalRowNumber === null) continue;
    const self = supplierIdByRowNumber.get(s.rowNumber);
    const canonical = supplierIdByRowNumber.get(s.canonicalRowNumber);
    if (self === undefined || canonical === undefined) {
      throw new Error(`Cannot link supplier row ${s.rowNumber} to ${s.canonicalRowNumber}`);
    }
    links.push([self, canonical]);
  }

  if (links.length) {
    const pairs = sql.join(
      links.map(([self, canonical]) => sql`(${self}::int, ${canonical}::int)`),
      sql`, `,
    );
    await tx.execute(sql`
      update ${supplier} as s
         set canonical_supplier_id = v.canonical
        from (values ${pairs}) as v(self, canonical)
       where s.id = v.self
    `);
  }

  return writeFindings(tx, ingestionRunId, landed, 'suppliers', findings);
}
