// Reference lookups shared by every promote step. Loaded once per run rather
// than queried per row: the tables are tiny, and a missing lookup should fail
// immediately with a readable message rather than produce a silently null link.
import type { Tx } from '../db/client.js';
import { emissionFactor, meterAdjustment, siteAlias } from '../db/schema.js';
import type { MeterAdjustment } from '../rules/electricity.js';

export interface ReferenceData {
  factorIdByActivity: Map<string, number>;
  /** "dataset|raw label" -> site id, absent when the label is deliberately unmapped. */
  siteIdByLabel: Map<string, number>;
  /** Labels declared unmapped, so an undeclared label stays distinguishable. */
  unmappedLabels: Set<string>;
  /** Known meter corrections, handed to the rules layer as plain data. */
  meterAdjustments: MeterAdjustment[];
}

export async function loadReferenceData(tx: Tx): Promise<ReferenceData> {
  const factors = await tx
    .select({ id: emissionFactor.id, activityKey: emissionFactor.activityKey })
    .from(emissionFactor);
  if (!factors.length) {
    throw new Error('No emission factors found. Run "npm run seed" before ingesting.');
  }

  const aliases = await tx
    .select({ dataset: siteAlias.dataset, rawLabel: siteAlias.rawLabel, siteId: siteAlias.siteId })
    .from(siteAlias);

  const siteIdByLabel = new Map<string, number>();
  const unmappedLabels = new Set<string>();
  for (const a of aliases) {
    const key = `${a.dataset}|${a.rawLabel}`;
    if (a.siteId === null) unmappedLabels.add(key);
    else siteIdByLabel.set(key, a.siteId);
  }

  const adjustments = await tx
    .select({
      id: meterAdjustment.id,
      meterId: meterAdjustment.meterId,
      effectiveFrom: meterAdjustment.effectiveFrom,
      effectiveTo: meterAdjustment.effectiveTo,
      multiplier: meterAdjustment.multiplier,
    })
    .from(meterAdjustment);

  return {
    factorIdByActivity: new Map(factors.map((f) => [f.activityKey, f.id])),
    siteIdByLabel,
    unmappedLabels,
    meterAdjustments: adjustments.map((a) => ({ ...a, multiplier: Number(a.multiplier) })),
  };
}

export function resolveFactor(ref: ReferenceData, activityKey: string): number {
  const id = ref.factorIdByActivity.get(activityKey);
  if (id === undefined) throw new Error(`No emission factor seeded for "${activityKey}"`);
  return id;
}

// Null only for labels the seed declared unmapped. An undeclared label throws,
// because silently dropping a site is what the alias table exists to prevent.
export function resolveSite(ref: ReferenceData, dataset: string, rawLabel: string): number | null {
  const key = `${dataset}|${rawLabel}`;
  const id = ref.siteIdByLabel.get(key);
  if (id !== undefined) return id;
  if (ref.unmappedLabels.has(key)) return null;
  throw new Error(`Undeclared location label in ${dataset}: "${rawLabel}"`);
}
