# Ironbark Ridge — ESG & Safety Intelligence

Ingestion and reporting for Ironbark Ridge Resources, a Queensland open-cut
coal mine. It loads four messy operational CSV exports without destroying the
originals, computes Scope 1 and Scope 2 emissions, summarises the safety
incident register, and reports every data problem it found alongside what it
did about each one.

The thing it is built around: any number on screen can be traced back to the
CSV line that produced it.

## Architecture

```
CSV ──▶ Land ──▶ Validate ──▶ Promote ──▶ Derive ──▶ Enrich
        raw       pure         typed       emissions   grounded
        jsonb     rules        tables      & trends    AI findings
                    │
                    └──▶ data quality findings (fixed / flagged / rejected)
```

Raw rows are immutable. Cleaning promotes a corrected copy into a typed table
and records what changed as a finding pointing back at the row that caused it.
A database constraint enforces that every row read is either promoted or
rejected, so nothing can be dropped silently.

| Directory | Responsibility |
|---|---|
| `src/db` | Drizzle schema and migrations |
| `src/ingest` | Land raw CSV rows verbatim |
| `src/rules` | Pure validation and normalisation, 21 rules |
| `src/promote` | Raw → typed domain tables |
| `src/domain` | Emissions and incident calculations |
| `src/contracts` | Zod schemas shared by the API and the frontend |
| `src/api` | HTTP layer (Express) |
| `src/ai` | Offline LLM enrichment — not built yet |

## Stack

Node 20, TypeScript, Express 5, Drizzle ORM against Neon Postgres, Zod for
validation, Vitest for tests.

Postgres runs on Neon because its free tier does not sleep — the deployed
demo has to work whenever it is opened. The HTTP driver is used rather than a
connection pool, since each serverless request gets its own short-lived
instance.

## Running it

Requires Node 20+ and a PostgreSQL database (Neon recommended).

```bash
npm install
cp .env.example .env        # then fill in DATABASE_URL
npm run db:migrate          # create the schema — 17 tables, 4 migrations
npm run seed                # emission factors, sites, calendar, known corrections
npm run ingest              # clean and load the four operational CSVs
npm run dev                 # API on http://localhost:3000/api
npm test                    # 134 tests
```

Order matters once: seed before ingest. Fuel and electricity resolve their
emission factors and site mappings at load time, and ingest refuses to start
without them.

`npm run ingest -- --dry-run` reports what would happen to every row without
keeping any of it. Both `seed` and `ingest` are safe to re-run — seed upserts,
and ingest clears the previous run before reloading.

`emission_factors.csv` is reference data rather than operational data, so it is
loaded by `seed` and does not appear in the ingest report.

## API

| Endpoint | Returns |
|---|---|
| `GET /api/emissions/monthly` | Scope 1 and 2 by month. `?basis=corrected` (default) or `as_reported`, so the size of our own corrections is visible |
| `GET /api/incidents/summary` | Counts by severity, type and site |
| `GET /api/incidents/trends` | Monthly incident counts, banded by severity |
| `GET /api/data-quality` | Every finding, per-rule counts, and per-file row counters |
| `GET /api/evidence/:sourceRowId` | A source row exactly as it arrived, with every finding raised against it |
| `GET /api/health` | Liveness |

Responses are validated against the Zod schemas in `src/contracts` before
being sent, so a route cannot quietly drift from its published shape.

## Tests

```
tests/rules/     89   pure functions, no database
tests/domain/    31   SQL: aggregation, calendar joins, both bases
tests/api/       14   routing, validation, contract conformance
```

The rules tests run against rows lifted verbatim from the CSVs, so a passing
test says something about the data we were given. The domain and API tests run
against a seeded database, because what they check is the SQL.

## Documentation

- [`docs/schema.md`](docs/schema.md) — entity diagram and the constraints behind it
- `WRITEUP.md` — data problems found, decisions taken, and the reasoning
