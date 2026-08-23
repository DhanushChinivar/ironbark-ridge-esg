// Fifteen rows naming thirteen companies. The merges are the point: two rows
// can describe one supplier for two very different reasons, and the difference
// matters more than the result. A shared ABN identifies a company. A matching
// name only suggests one. Both are merged here, and each match carries the kind
// of evidence it actually rests on, so a reader can overturn the weak ones
// without having to re-derive which those were.
import { sql } from 'drizzle-orm';
import type { Tx } from '../db/client.js';
import type { SupplierResolution } from '../contracts/index.js';

interface CompanyRow extends Record<string, unknown> {
  id: number;
  source_row_number: number;
  name: string;
  abn_raw: string | null;
  abn_format_valid: boolean | null;
  category: string | null;
  own_spend: string | null;
  total_spend: string;
  merged_count: number;
}

interface MergeRow extends Record<string, unknown> {
  canonical_id: number;
  source_row_number: number;
  name: string;
  abn_raw: string | null;
  category: string | null;
  spend: string | null;
  match_method: string;
}

const money = (v: string | null) => (v === null ? null : Number(v));

export async function supplierResolution(tx: Tx): Promise<SupplierResolution> {
  // Spend is summed across the merged rows, not taken from the canonical one.
  // Ironline's two rows carry $8.94M and $1.212M; reporting either alone
  // understates what the site spent with that company.
  const companies = await tx.execute<CompanyRow>(sql`
    select s.id,
           sr.row_number                                   as source_row_number,
           s.name_raw                                      as name,
           s.abn_raw,
           s.abn_format_valid,
           s.category_raw                                  as category,
           s.fy_spend_aud                                  as own_spend,
           coalesce(s.fy_spend_aud, 0)
             + coalesce((select sum(d.fy_spend_aud) from supplier d
                         where d.canonical_supplier_id = s.id), 0)
                                                           as total_spend,
           (select count(*) from supplier d
            where d.canonical_supplier_id = s.id)::int      as merged_count
    from supplier s
    join source_row sr on sr.id = s.source_row_id
    where s.canonical_supplier_id is null
    order by total_spend desc
  `);

  const merges = await tx.execute<MergeRow>(sql`
    select s.canonical_supplier_id                         as canonical_id,
           sr.row_number                                   as source_row_number,
           s.name_raw                                      as name,
           s.abn_raw,
           s.category_raw                                  as category,
           s.fy_spend_aud                                  as spend,
           s.match_method
    from supplier s
    join source_row sr on sr.id = s.source_row_id
    where s.canonical_supplier_id is not null
    order by sr.row_number
  `);

  const mergedInto = new Map<number, MergeRow[]>();
  for (const m of merges.rows) {
    const list = mergedInto.get(m.canonical_id) ?? [];
    list.push(m);
    mergedInto.set(m.canonical_id, list);
  }

  return {
    rowsRead: companies.rows.length + merges.rows.length,
    companies: companies.rows.map((c) => ({
      supplierId: c.id,
      sourceRowNumber: c.source_row_number,
      name: c.name,
      abn: c.abn_raw,
      abnFormatValid: c.abn_format_valid,
      category: c.category,
      ownSpendAud: money(c.own_spend),
      totalSpendAud: Number(c.total_spend),
      mergedFrom: (mergedInto.get(c.id) ?? []).map((m) => ({
        sourceRowNumber: m.source_row_number,
        name: m.name,
        abn: m.abn_raw,
        spendAud: money(m.spend),
        matchMethod: m.match_method,
        // Only set where the two rows disagreed. The merge keeps the canonical
        // value, so the discarded one has nowhere else to be seen.
        discardedCategory: m.category !== null && m.category !== c.category ? m.category : null,
        // The whole reason match_method is stored. An ABN match is a fact about
        // the company; a name match is a judgement about two strings.
        proven: m.match_method === 'abn',
      })),
    })),
    totals: {
      companies: companies.rows.length,
      merged: merges.rows.length,
      provenMerges: merges.rows.filter((m) => m.match_method === 'abn').length,
      inferredMerges: merges.rows.filter((m) => m.match_method !== 'abn').length,
      missingAbn: companies.rows.filter((c) => c.abn_raw === null || c.abn_raw === '').length,
      invalidAbn: companies.rows.filter((c) => c.abn_format_valid === false).length,
    },
  };
}
