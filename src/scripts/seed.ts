// Reference data: what the pipeline joins to, rather than what it derives from
// the operational files. Safe to re-run - every insert is an upsert or a no-op.
import { parse } from 'csv-parse/sync';
import { readFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  emissionFactor,
  meterAdjustment,
  reportPeriod,
  severityScale,
  site,
  siteAlias,
} from '../db/schema.js';

const DATA = new URL('../../data/', import.meta.url);

function readCsv(file: string): Record<string, string>[] {
  return parse(readFileSync(new URL(file, DATA), 'utf8'), {
    columns: (h: string[]) => h.map((c) => c.trim()),
    trim: true,
    bom: true,
  });
}

/* -- emission factors ------------------------------------------------------ */

// The file is supplied clean and used as given. activity_key is ours, so that
// deliveries and readings point at a factor without matching on prose.
const ACTIVITY_KEYS: [RegExp, string][] = [
  [/^diesel/i, 'diesel'],
  [/^petrol/i, 'petrol'],
  [/^grid electricity/i, 'grid_electricity_qld'],
];

async function seedEmissionFactors(): Promise<number> {
  const rows = readCsv('emission_factors.csv');
  for (const r of rows) {
    const key = ACTIVITY_KEYS.find(([re]) => re.test(r.activity ?? ''))?.[1];
    if (!key) throw new Error(`Unrecognised emission factor activity: "${r.activity}"`);
    await db
      .insert(emissionFactor)
      .values({
        activityKey: key,
        activity: r.activity!,
        scope: Number(r.scope),
        unit: r.unit!,
        kgCo2ePerUnit: r.kg_co2e_per_unit!,
        source: r.source!,
      })
      .onConflictDoNothing();
  }
  return rows.length;
}

/* -- severity scale -------------------------------------------------------- */

// Only the mappings that hold everywhere.
//
// "Low" is deliberately absent. Incidents sharing a templated description show
// it standing in for 1 in some incident types and 2 in others, so a single
// global value would be wrong for one group or the other. The rules layer
// resolves it per incident instead, from the numerically coded incidents that
// share its description.
const SEVERITY_SCALE = [
  { rawValue: '1', normalised: 1, note: 'Recorded numerically.' },
  { rawValue: '2', normalised: 2, note: 'Recorded numerically.' },
  { rawValue: '3', normalised: 3, note: 'Recorded numerically.' },
  {
    rawValue: 'Medium',
    normalised: 3,
    note:
      'INC-2026-021 (Medium) shares its description with INC-2025-008 (3); ' +
      'no conflicting evidence elsewhere in the register.',
  },
];

async function seedSeverityScale(): Promise<number> {
  for (const s of SEVERITY_SCALE) {
    await db.insert(severityScale).values(s).onConflictDoNothing();
  }
  return SEVERITY_SCALE.length;
}

/* -- sites and their aliases ---------------------------------------------- */

const SITES = [
  ['Open Cut - North Pit', 'Open cut mining area, northern pit'],
  ['Open Cut - South Pit', 'Open cut mining area, southern pit'],
  ['Processing Plant', 'Coal handling and preparation plant'],
  ['Haul Fleet', 'Haul trucks and associated mobile fleet'],
  ['Light Vehicles', 'Light vehicle fleet'],
  ['Site Services', 'Site-wide support services'],
] as const;

// Fuel deliveries and the incident register use an identical set of six labels,
// so those map exactly. The meters describe systems rather than places, and only
// one of the six corresponds to a site: mapping the rest would invent a
// relationship the data does not support.
const UNMAPPABLE_METER =
  'Meter describes a functional system rather than an operational area; ' +
  'no basis in the source data for assigning it to a site.';

const ALIASES: { dataset: string; rawLabel: string; siteName: string | null; note?: string }[] = [
  ...SITES.map(([name]) => ({ dataset: 'fuel_deliveries', rawLabel: name, siteName: name })),
  ...SITES.map(([name]) => ({ dataset: 'incident_register', rawLabel: name, siteName: name })),
  {
    dataset: 'electricity_meter_readings',
    rawLabel: 'Processing Plant',
    siteName: 'Processing Plant',
  },
  ...[
    'Admin & Camp',
    'CHPP Conveyors',
    'Ventilation & Dewatering',
    'Water Management',
    'Workshops',
  ].map((rawLabel) => ({
    dataset: 'electricity_meter_readings',
    rawLabel,
    siteName: null,
    note: UNMAPPABLE_METER,
  })),
];

async function seedSites(): Promise<{ sites: number; aliases: number }> {
  for (const [canonicalName, description] of SITES) {
    await db.insert(site).values({ canonicalName, description }).onConflictDoNothing();
  }

  const existing = await db.select().from(site);
  const idByName = new Map(existing.map((s) => [s.canonicalName, s.id]));

  for (const a of ALIASES) {
    const siteId = a.siteName ? idByName.get(a.siteName) : null;
    if (a.siteName && !siteId) throw new Error(`Alias references unknown site "${a.siteName}"`);
    await db
      .insert(siteAlias)
      .values({
        dataset: a.dataset,
        rawLabel: a.rawLabel,
        siteId: siteId ?? null,
        matchConfidence: siteId ? 'exact' : 'unmapped',
        note: a.note ?? null,
      })
      .onConflictDoNothing();
  }

  assertNoUndeclaredLabels();
  return { sites: SITES.length, aliases: ALIASES.length };
}

// A label appearing in a source file that nobody mapped would otherwise be
// dropped silently at ingest. This is the failure site_alias exists to prevent.
function assertNoUndeclaredLabels(): void {
  const declared = new Set(ALIASES.map((a) => `${a.dataset}|${a.rawLabel}`));
  const found: string[] = [
    ...readCsv('fuel_deliveries.csv').map((r) => `fuel_deliveries|${r['Site Area']}`),
    ...readCsv('incident_register.csv').map((r) => `incident_register|${r.location}`),
    ...readCsv('electricity_meter_readings.csv').map(
      (r) => `electricity_meter_readings|${r.meter_description}`,
    ),
  ];
  const missing = [...new Set(found)].filter((k) => !declared.has(k));
  if (missing.length) {
    throw new Error(`Unmapped location labels in source data:\n  ${missing.join('\n  ')}`);
  }
}

/* -- reporting calendar ---------------------------------------------------- */

// The span of all three activity files. Without this, November 2025 - which has
// no fuel deliveries at all - would vanish from a monthly GROUP BY rather than
// reporting as a gap.
const WINDOW_START = '2025-01';
const WINDOW_END = '2026-06';

async function seedReportPeriods(): Promise<number> {
  const [sy, sm] = WINDOW_START.split('-').map(Number) as [number, number];
  const [ey, em] = WINDOW_END.split('-').map(Number) as [number, number];

  const months: string[] = [];
  for (let y = sy, m = sm; y < ey || (y === ey && m <= em); m === 12 ? ((y += 1), (m = 1)) : (m += 1)) {
    months.push(`${y}-${String(m).padStart(2, '0')}-01`);
  }

  for (const periodMonth of months) {
    await db.insert(reportPeriod).values({ periodMonth }).onConflictDoNothing();
  }
  return months.length;
}

/* -- known meter corrections ---------------------------------------------- */

// MTR-07 drops from ~250,000 to ~250 between September and October 2025 and
// never recovers, while still labelled kWh. effective_to is null because the
// fault is still present in the last reading available.
const MTR07 = {
  meterId: 'MTR-07',
  effectiveFrom: '2025-10-01',
  effectiveTo: null,
  multiplier: '1000',
  reason: 'Meter reporting in MWh while labelled kWh.',
  evidence:
    'MTR-07 reads 274,790.9 kWh in 2025-09 and 277.0 in 2025-10, holding near 250 for the ' +
    'remaining nine months. No other meter shows a comparable step and site load is otherwise ' +
    'stable, so the change is a unit switch rather than a genuine drop in demand.',
};

async function seedMeterAdjustments(): Promise<number> {
  const existing = await db
    .select()
    .from(meterAdjustment)
    .where(eq(meterAdjustment.meterId, MTR07.meterId));
  if (existing.length) return 0;
  await db.insert(meterAdjustment).values(MTR07);
  return 1;
}

/* -------------------------------------------------------------------------- */

const factors = await seedEmissionFactors();
const severities = await seedSeverityScale();
const sites = await seedSites();
const periods = await seedReportPeriods();
const adjustments = await seedMeterAdjustments();

console.log('Seeded reference data:');
console.log(`  emission factors    ${factors}`);
console.log(`  severity mappings   ${severities}`);
console.log(`  sites               ${sites.sites}`);
console.log(`  site aliases        ${sites.aliases}`);
console.log(`  report periods      ${periods}`);
console.log(`  meter adjustments   ${adjustments}${adjustments === 0 ? ' (already present)' : ''}`);
