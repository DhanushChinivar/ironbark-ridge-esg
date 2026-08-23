// Pure functions, no database, so these can be tested against the real rows.
//
// 15 rows, 13 companies. Neither matching strategy finds both duplicates on its
// own: Blackwood's misspelling defeats name matching, Ironline's blank ABN
// defeats ABN matching. So match_method records which one applied.
import { finding, type Finding } from './finding.js';

export interface RawSupplierRow {
  rowNumber: number;
  supplier_name: string;
  abn: string;
  category: string;
  fy_spend_aud: string;
}

export interface CleanSupplier {
  rowNumber: number;
  nameRaw: string;
  nameNormalised: string;
  abnRaw: string | null;
  abnDigits: string | null;
  // Format only. The modulus-89 checksum is not run: every ABN here is synthetic.
  abnFormatValid: boolean | null;
  categoryRaw: string | null;
  categoryNormalised: string | null;
  fySpendAud: string | null;
  /** Row number of the canonical record; null when this row is canonical. */
  canonicalRowNumber: number | null;
  matchMethod: 'abn' | 'name' | null;
}

export interface SupplierRuleResult {
  suppliers: CleanSupplier[];
  findings: Finding[];
}

/** Legal-form suffixes carry no identity: "Pty Ltd" and "P/L" name one company. */
const LEGAL_SUFFIXES = /\b(pty\s*ltd|pty\s*limited|p\/?l|proprietary\s*limited|ltd|limited|co|inc)\b/g;

export function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(LEGAL_SUFFIXES, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normaliseCategory(category: string): string {
  return category.toLowerCase().replace(/\s+/g, ' ').trim();
}

// Null for a blank field, so "no ABN" stays distinct from "malformed ABN".
export function abnDigits(abn: string): string | null {
  const digits = abn.replace(/\D/g, '');
  return digits.length ? digits : null;
}

export function parseSpend(value: string): string | null {
  const cleaned = value.replace(/[$,\s]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n.toFixed(2) : null;
}

export function applySupplierRules(rows: RawSupplierRow[]): SupplierRuleResult {
  const findings: Finding[] = [];

  const suppliers: CleanSupplier[] = rows.map((r) => {
    const digits = abnDigits(r.abn);
    const formatValid = digits === null ? null : digits.length === 11;

    if (digits === null) {
      findings.push(
        finding('SUP_ABN_MISSING', r.rowNumber, { field: 'abn', originalValue: r.abn }),
      );
    } else if (!formatValid) {
      findings.push(
        finding('SUP_ABN_FORMAT', r.rowNumber, {
          field: 'abn',
          originalValue: r.abn,
          detail: { digitsFound: digits.length, digitsExpected: 11 },
        }),
      );
    }

    return {
      rowNumber: r.rowNumber,
      nameRaw: r.supplier_name,
      nameNormalised: normaliseName(r.supplier_name),
      abnRaw: r.abn || null,
      abnDigits: digits,
      abnFormatValid: formatValid,
      categoryRaw: r.category || null,
      categoryNormalised: r.category ? normaliseCategory(r.category) : null,
      fySpendAud: parseSpend(r.fy_spend_aud),
      canonicalRowNumber: null,
      matchMethod: null,
    };
  });

  // Needs the whole file, so it cannot run inside the map above.
  resolveDuplicates(suppliers, findings);
  return { suppliers, findings };
}

// A merge keeps the canonical row's fields. Where the two rows disagreed about
// one, the discarded value is worth stating: "Fuel" and "Fuel supply" mean the
// same thing here, but the merge is the moment a category could quietly change,
// and a reader should be told rather than left to diff the file.
function flagFieldConflicts(
  canonical: CleanSupplier,
  dup: CleanSupplier,
  evidence: 'abn' | 'name',
  findings: Finding[],
): void {
  if (!canonical.categoryNormalised || !dup.categoryNormalised) return;
  if (canonical.categoryNormalised === dup.categoryNormalised) return;

  findings.push(
    finding('SUP_MERGE_FIELD_CONFLICT', dup.rowNumber, {
      field: 'category',
      originalValue: dup.categoryRaw ?? '',
      correctedValue: canonical.categoryRaw ?? '',
      detail: {
        mergedIntoRowNumber: canonical.rowNumber,
        evidence,
        field: 'category',
        kept: canonical.categoryRaw,
        discarded: dup.categoryRaw,
      },
    }),
  );
}

// Strongest evidence first. A shared ABN is proof, a shared name is a guess, so
// the name pass runs second and never overwrites an ABN match.
function resolveDuplicates(suppliers: CleanSupplier[], findings: Finding[]): void {
  const byAbn = new Map<string, CleanSupplier[]>();
  for (const s of suppliers) {
    if (!s.abnDigits || !s.abnFormatValid) continue;
    byAbn.set(s.abnDigits, [...(byAbn.get(s.abnDigits) ?? []), s]);
  }

  for (const [abn, group] of byAbn) {
    if (group.length < 2) continue;
    const [canonical, ...rest] = group;
    if (!canonical) continue;
    for (const dup of rest) {
      dup.canonicalRowNumber = canonical.rowNumber;
      dup.matchMethod = 'abn';
      findings.push(
        finding('SUP_DUPLICATE_ABN', dup.rowNumber, {
          field: 'supplier_name',
          originalValue: dup.nameRaw,
          correctedValue: canonical.nameRaw,
          detail: {
            mergedIntoRowNumber: canonical.rowNumber,
            evidence: 'abn',
            abn,
            namesCompared: [canonical.nameRaw, dup.nameRaw],
          },
        }),
      );
      flagFieldConflicts(canonical, dup, 'abn', findings);
    }
  }

  const byName = new Map<string, CleanSupplier[]>();
  for (const s of suppliers) {
    // A proven match is never downgraded by a later pass.
    if (s.canonicalRowNumber !== null) continue;
    byName.set(s.nameNormalised, [...(byName.get(s.nameNormalised) ?? []), s]);
  }

  for (const group of byName.values()) {
    if (group.length < 2) continue;
    // Prefer whichever has an ABN.
    const canonical = group.find((s) => s.abnDigits) ?? group[0];
    if (!canonical) continue;
    for (const dup of group) {
      if (dup === canonical) continue;
      dup.canonicalRowNumber = canonical.rowNumber;
      dup.matchMethod = 'name';
      findings.push(
        finding('SUP_DUPLICATE_NAME', dup.rowNumber, {
          field: 'supplier_name',
          originalValue: dup.nameRaw,
          correctedValue: canonical.nameRaw,
          detail: {
            mergedIntoRowNumber: canonical.rowNumber,
            evidence: 'name',
            abn: canonical.abnRaw,
            namesCompared: [canonical.nameRaw, dup.nameRaw],
            normalisedTo: canonical.nameNormalised,
          },
        }),
      );
      flagFieldConflicts(canonical, dup, 'name', findings);
    }
  }
}
