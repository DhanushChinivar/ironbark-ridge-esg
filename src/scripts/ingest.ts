// Runs the pipeline over the source files and reports what happened to every
// row. Pass --dry-run to see the report without keeping anything.
//
// The pipeline owns the whole dataset rather than adding to it, so a run starts
// by clearing previous runs and removes its own work if anything fails. Half a
// dataset is worse than none: every total would be wrong in a way that still
// looked entirely plausible.
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { emissionFactor, ingestionRun } from '../db/schema.js';
import { landFile } from '../ingest/land.js';
import { promoteElectricity } from '../promote/electricity.js';
import { promoteFuel } from '../promote/fuel.js';
import { promoteIncidents } from '../promote/incidents.js';
import { promoteSuppliers } from '../promote/suppliers.js';
import { loadReferenceData } from '../promote/reference.js';
import type { PromotionSummary } from '../promote/findings.js';

const dryRun = process.argv.includes('--dry-run');

const seeded = await db.select({ id: emissionFactor.id }).from(emissionFactor).limit(1);
if (!seeded.length) {
  throw new Error('No reference data found. Run "npm run seed" before ingesting.');
}

// Everything downstream cascades from the run, so this one statement clears
// source rows, promoted rows and findings together.
await db.delete(ingestionRun);

const [run] = await db
  .insert(ingestionRun)
  .values({ notes: dryRun ? 'Dry run: discarded on completion.' : null })
  .returning({ id: ingestionRun.id });

if (!run) throw new Error('Could not start an ingestion run');

const summaries: PromotionSummary[] = [];

try {
  const ref = await loadReferenceData(db);

  const suppliers = await landFile(db, run.id, 'suppliers.csv');
  summaries.push(await promoteSuppliers(db, run.id, suppliers));

  const fuel = await landFile(db, run.id, 'fuel_deliveries.csv');
  summaries.push(await promoteFuel(db, run.id, fuel, ref));

  const electricity = await landFile(db, run.id, 'electricity_meter_readings.csv');
  summaries.push(await promoteElectricity(db, run.id, electricity, ref));

  const incidents = await landFile(db, run.id, 'incident_register.csv');
  summaries.push(await promoteIncidents(db, run.id, incidents, ref));

  await db
    .update(ingestionRun)
    .set({ status: 'succeeded', finishedAt: new Date() })
    .where(eq(ingestionRun.id, run.id));
} catch (err) {
  await db.delete(ingestionRun).where(eq(ingestionRun.id, run.id));
  console.error('\nIngestion failed. Nothing was kept.\n');
  throw err;
}

const pad = (s: string | number, n: number) => String(s).padStart(n);
const rule = '  ' + '-'.repeat(79);

console.log(`\nIngestion run ${run.id}${dryRun ? ' (dry run)' : ''}\n`);
console.log('  file                             read  promoted  flagged  rejected  findings');
console.log(rule);

for (const s of summaries) {
  console.log(
    `  ${s.fileName.padEnd(31)}${pad(s.rowsRead, 4)}${pad(s.rowsPromoted, 10)}` +
      `${pad(s.rowsFlagged, 9)}${pad(s.rowsRejected, 10)}${pad(s.findings, 10)}`,
  );
}

const total = summaries.reduce(
  (a, s) => ({
    read: a.read + s.rowsRead,
    promoted: a.promoted + s.rowsPromoted,
    flagged: a.flagged + s.rowsFlagged,
    rejected: a.rejected + s.rowsRejected,
    findings: a.findings + s.findings,
  }),
  { read: 0, promoted: 0, flagged: 0, rejected: 0, findings: 0 },
);

console.log(rule);
console.log(
  `  ${'total'.padEnd(31)}${pad(total.read, 4)}${pad(total.promoted, 10)}` +
    `${pad(total.flagged, 9)}${pad(total.rejected, 10)}${pad(total.findings, 10)}`,
);

if (dryRun) {
  await db.delete(ingestionRun).where(eq(ingestionRun.id, run.id));
  console.log('\n  Dry run: nothing was kept.');
}
