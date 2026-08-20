# Ironbark Ridge — ESG & Safety Intelligence

Ingestion and reporting for Ironbark Ridge Resources, a Queensland open-cut
coal mine. It loads five messy operational CSV exports without destroying the
originals, computes Scope 1 and Scope 2 emissions, analyses the incident
register with an LLM, and reports every data problem it found alongside what
it did about each one.

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
| `src/rules` | Pure validation and normalisation |
| `src/promote` | Raw → typed domain tables |
| `src/domain` | Emissions and incident calculations |
| `src/ai` | Offline LLM enrichment, grounded and versioned |
| `src/api` | HTTP layer (Hono) |
| `src/contracts` | Zod schemas shared with the frontend |

## Running it

Requires Node 20+ and a PostgreSQL database (Neon recommended).

```bash
npm install
cp .env.example .env        # then fill in DATABASE_URL and ANTHROPIC_API_KEY
npm run db:migrate          # create the schema
npm run seed                # emission factors and reference data
npm run ingest              # clean and load the five CSVs
npm run enrich              # LLM incident analysis (needs an Anthropic key)
npm run dev                 # API on http://localhost:3000
```

`npm run ingest -- --dry-run` reports what would happen to every row without
writing anything to the domain tables.

## Documentation

- [`docs/schema.md`](docs/schema.md) — entity diagram and the constraints behind it
- `WRITEUP.md` — data problems found, decisions taken, and the reasoning
