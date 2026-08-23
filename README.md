# Ironbark Ridge — ESG & Safety Intelligence

Ingestion and reporting for Ironbark Ridge Resources, a Queensland open-cut
coal mine. It loads four messy operational CSV exports without destroying the
originals, computes Scope 1 and Scope 2 emissions, summarises the safety
incident register, and reports every data problem it found alongside what it
did about each one.

The thing it is built around: any number on screen can be traced back to the
CSV line that produced it.

Live at **https://ironbark-ridge-esg.vercel.app**.

## Where to look

Four sections, and three of them have a second page that shows the working
rather than describing it. Those three are the point of the project:

| Page | What it shows |
|---|---|
| [`/emissions/calculation`](https://ironbark-ridge-esg.vercel.app/emissions/calculation) | One month unrolled: source file and line, quantity used, factor applied, result per row — then reconciled against the figure the dashboard reports by a separate query |
| [`/safety/method`](https://ironbark-ridge-esg.vercel.app/safety/method) | One classification taken apart: the instruction actually sent, the record given, the structured answer, and the quote check re-run live against the stored description |
| [`/data-trust/suppliers`](https://ironbark-ridge-esg.vercel.app/data-trust/suppliers) | 15 supplier rows resolved to 13 companies, with each merge stating whether it rests on a shared ABN or on a name alone |

If you only open one, open the first. It is where "every number traces back to a
CSV line" stops being a claim.

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

Directories follow the pipeline rather than the technology, so the flow above
reads top to bottom in the tree:

| Path | Responsibility |
|---|---|
| `src/ingest` | Land raw CSV rows verbatim |
| `src/rules` | Pure validation and normalisation, 22 rules — no database import, which is why most tests need no database |
| `src/promote` | Raw → typed domain tables |
| `src/domain` | Emissions, incident and data quality calculations |
| `src/ai` | Offline classification: prompts, hand labels, grounding check |
| `src/contracts` | Zod schemas shared by the API and the frontend |
| `src/api` | HTTP layer (Express) |
| `src/db` | Drizzle schema and migrations |
| `src/scripts` | Command-line entry points: seed, ingest, enrich, evaluate, serve |
| `api/` | Vercel's serverless entry. Four lines, and it exports the app from `src/api` — the deployment adapter, not a second API |
| `web/` | Vue dashboard, its own package |
| `tests/` | Mirrors `src`: `rules` / `domain` / `api` |
| `data/` | The four operational CSVs plus the emission factors, unmodified |
| `docs/` | Schema diagram, labelling rubric, evaluation method |

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
npm run db:migrate          # create the schema — 17 tables, 5 migrations
npm run seed                # emission factors, sites, calendar, known corrections
npm run ingest              # clean and load the four operational CSVs
npm run label               # the 42 hand-written incident labels
npm run enrich              # classify the incidents — the only step that calls the API
npm run evaluate            # score the classifier against the labels
npm run dev                 # API on http://localhost:3000/api
npm test                    # 169 tests
```

The dashboard is a separate Vite app in `web/`, run alongside the API:

```bash
npm install --prefix web
npm run dev --prefix web    # http://localhost:5173, proxying /api to port 3000
```

Order matters once: seed before ingest. Fuel and electricity resolve their
emission factors and site mappings at load time, and ingest refuses to start
without them.

`npm run ingest -- --dry-run` reports what would happen to every row without
keeping any of it. Both `seed` and `ingest` are safe to re-run — seed upserts,
and ingest clears the previous run before reloading.

`emission_factors.csv` is reference data rather than operational data, so it is
loaded by `seed` and does not appear in the ingest report.

`label` and `enrich` are only needed for the Safety pages. `enrich` requires
`ANTHROPIC_API_KEY` and is the one step that calls a model; everything else runs
offline. Re-running `ingest` clears the incidents and takes the classifications
with them, so `label` and `enrich` have to follow it.

## API

| Endpoint | Returns |
|---|---|
| `GET /api/emissions/monthly` | Scope 1 and 2 by month. `?basis=corrected` (default) or `as_reported`, so the size of our own corrections is visible |
| `GET /api/emissions/calculation` | The rows behind one month: quantity, factor and result per line, with the aggregate beside the hand total so the two can be compared |
| `GET /api/incidents/summary` | Counts by severity, type and site |
| `GET /api/incidents/trends` | Monthly incident counts, banded by severity |
| `GET /api/ai/findings` | Every stored classification: hazard category, psychosocial flag, severity concern, each with the source quote it was grounded against |
| `GET /api/ai/trace` | How one classification was reached: the instruction sent, the record given, the structured answer, and the groundedness check re-run against the stored description |
| `GET /api/data-quality` | Every finding, per-rule counts, and per-file row counters |
| `GET /api/suppliers` | Supplier records resolved to companies, each merge stating whether it rests on a shared ABN or on a name alone |
| `GET /api/evidence/:sourceRowId` | A source row exactly as it arrived, with every finding raised against it |
| `GET /api/health` | Liveness |

Responses are validated against the Zod schemas in `src/contracts` before
being sent, so a route cannot quietly drift from its published shape.

## Tests

```
tests/rules/     93   pure functions, no database
tests/domain/    48   SQL: aggregation, calendar joins, both bases
tests/api/       28   routing, validation, contract conformance
```

The rules tests run against rows lifted verbatim from the CSVs, so a passing
test says something about the data we were given. The domain and API tests run
against a seeded database, because what they check is the SQL.

## Deployment

Vercel serves the built `web/dist` as static files and routes `/api/*` to a
single serverless function. That function is four lines: it exports the same
Express app `npm run dev` starts locally, so there is no second copy of the
routing to keep in step.

`DATABASE_URL` is the only variable the deployment needs. The Anthropic key
stays local, because classification runs as a batch job (`npm run enrich`) and
its output is stored in Postgres — the site never calls the model.

## Documentation

- [`docs/schema.md`](docs/schema.md) — entity diagram and the constraints behind it
- [`docs/ai-evaluation.md`](docs/ai-evaluation.md) — how the classifier is scored, and the ablation that made the score mean something
- [`docs/ai-labelling-rubric.md`](docs/ai-labelling-rubric.md) — the criteria the 42 hand labels were written against
- `WRITEUP.md` — data problems found, decisions taken, and the reasoning
