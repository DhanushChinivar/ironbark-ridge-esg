import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/api/app.js';
import {
  aiFindingsSchema,
  aiTraceSchema,
  dataQualityReportSchema,
  emissionsCalculationSchema,
  evidenceSchema,
  incidentSummarySchema,
  incidentTrendSchema,
  monthlyEmissionsSchema,
  supplierResolutionSchema,
} from '../../src/contracts/index.js';

// supertest boots the app on an ephemeral port per request, so these hit real
// routing and real validation without a server we have to manage.
const get = (path: string) => request(app).get(path);

// Responses are parsed through the published contract, so a route that drifts
// from its schema fails here rather than in the frontend.
async function getParsed<T>(path: string, schema: { parse: (v: unknown) => T }): Promise<T> {
  return schema.parse((await get(path)).body);
}

const errorOf = async (path: string) => ((await get(path)).body as { error: string }).error;

describe('GET /api/health', () => {
  it('answers without touching the database', async () => {
    const res = await get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('serves 404 for an unknown route', async () => {
    expect((await get('/api/nope')).status).toBe(404);
  });
});

describe('GET /api/emissions/monthly', () => {
  it('defaults to the corrected basis', async () => {
    const body = await getParsed('/api/emissions/monthly', monthlyEmissionsSchema);
    expect(body.basis).toBe('corrected');
  });

  it('serves the as-reported basis on request', async () => {
    const body = await getParsed('/api/emissions/monthly?basis=as_reported', monthlyEmissionsSchema);
    expect(body.basis).toBe('as_reported');
    expect(body.totals.scope2Tco2e).toBeCloseTo(23333.2, 1);
  });

  it('rejects an unknown basis with a readable message', async () => {
    const res = await get('/api/emissions/monthly?basis=nonsense');
    expect(res.status).toBe(400);
    expect(await errorOf('/api/emissions/monthly?basis=nonsense')).toMatch(/corrected/);
  });

  it('states the size of the correction rather than applying it silently', async () => {
    const body = await getParsed('/api/emissions/monthly', monthlyEmissionsSchema);
    expect(body.correction.differenceTco2e).toBeCloseTo(1544.2, 1);
  });

  it('names the month that has no fuel data', async () => {
    const body = await getParsed('/api/emissions/monthly', monthlyEmissionsSchema);
    expect(body.monthsWithoutFuelData).toEqual(['2025-11']);
  });
});

describe('GET /api/incidents', () => {
  it('summarises the register', async () => {
    const body = await getParsed('/api/incidents/summary', incidentSummarySchema);
    expect(body.total).toBe(42);
    expect(body.unresolvedSeverity).toBe(1);
  });

  it('returns a trend covering the whole window', async () => {
    const body = await getParsed('/api/incidents/trends', incidentTrendSchema);
    expect(body.months).toHaveLength(18);
  });
});

describe('GET /api/data-quality', () => {
  it('returns findings, per-rule counts and per-file counters', async () => {
    const body = await getParsed('/api/data-quality', dataQualityReportSchema);
    expect(body.files).toHaveLength(4);
    expect(body.byRule.length).toBeGreaterThan(10);
    expect(body.findings.length).toBe(body.totals.findings);
  });

  it('rejects nothing, and says so', async () => {
    const body = await getParsed('/api/data-quality', dataQualityReportSchema);
    expect(body.totals.rejected).toBe(0);
  });
});

describe('GET /api/evidence/:sourceRowId', () => {
  it('walks a finding back to the CSV line that produced it', async () => {
    const report = await getParsed('/api/data-quality', dataQualityReportSchema);
    const finding = report.findings.find((f) => f.ruleCode === 'FUEL_NEGATIVE_ACTIVITY');
    expect(finding?.sourceRowId).toBeTruthy();

    const evidence = await getParsed(`/api/evidence/${finding!.sourceRowId}`, evidenceSchema);
    expect(evidence.fileName).toBe('fuel_deliveries.csv');
    expect(evidence.raw['Invoice No']).toBe('INV-41777');
    expect(evidence.rowNumber).toBe(finding!.sourceRowNumber);
  });

  it('404s for a row that does not exist', async () => {
    expect((await get('/api/evidence/999999')).status).toBe(404);
  });

  it('400s for an id that is not a number', async () => {
    expect((await get('/api/evidence/abc')).status).toBe(400);
  });
});

// The four routes below carry query parameters or feed a page of their own, so
// the route layer has work to do that the domain tests do not exercise: parsing
// what came in, and answering sensibly when it is wrong.
describe('GET /api/emissions/calculation', () => {
  it('unrolls the month the dashboard reports, and agrees with it', async () => {
    const body = await getParsed('/api/emissions/calculation?month=2026-03', emissionsCalculationSchema);
    expect(body.month).toBe('2026-03');
    expect(body.basis).toBe('corrected');
    expect(body.totalTco2e).toBeCloseTo(body.reported.totalTco2e, 1);
  });

  it('serves the as-reported basis on request', async () => {
    const body = await getParsed(
      '/api/emissions/calculation?month=2026-03&basis=as_reported',
      emissionsCalculationSchema,
    );
    expect(body.basis).toBe('as_reported');
    // MTR-07 is rescaled on the corrected basis, so the two must differ.
    const corrected = await getParsed('/api/emissions/calculation?month=2026-03', emissionsCalculationSchema);
    expect(body.totalTco2e).toBeLessThan(corrected.totalTco2e);
  });

  it('labels the negative fuel line rather than serving a bare minus', async () => {
    const body = await getParsed('/api/emissions/calculation?month=2025-08', emissionsCalculationSchema);
    const noted = body.scopes.flatMap((s) => s.lines).filter((l) => l.note !== null);
    expect(noted).toHaveLength(1);
    expect(noted[0]!.reference).toBe('INV-41777');
    expect(noted[0]!.kgCo2e).toBeLessThan(0);
  });

  it('requires a month rather than defaulting to one', async () => {
    const res = await get('/api/emissions/calculation');
    expect(res.status).toBe(400);
    expect(await errorOf('/api/emissions/calculation')).toMatch(/YYYY-MM/);
  });

  it('rejects a malformed month, including a thirteenth one', async () => {
    expect((await get('/api/emissions/calculation?month=2026-13')).status).toBe(400);
    expect((await get('/api/emissions/calculation?month=March')).status).toBe(400);
  });

  it('serves 404 for a well-formed month outside the reporting window', async () => {
    const res = await get('/api/emissions/calculation?month=2030-01');
    expect(res.status).toBe(404);
    expect((res.body as { error: string }).error).toMatch(/2030-01/);
  });
});

describe('GET /api/ai/findings', () => {
  it('serves every classification made by the pinned prompt', async () => {
    const body = await getParsed('/api/ai/findings', aiFindingsSchema);
    expect(body.totals.classified).toBe(body.findings.length);
    expect(body.promptVersion).toBe('with-criteria');
  });

  it('quotes source text on every finding, because an unquoted one is discarded', async () => {
    const body = await getParsed('/api/ai/findings', aiFindingsSchema);
    for (const f of body.findings) {
      expect(f.description).toContain(f.categoryEvidenceQuote.trim());
    }
  });
});

describe('GET /api/ai/trace', () => {
  it('opens on a finding when no incident is named', async () => {
    const body = await getParsed('/api/ai/trace', aiTraceSchema);
    expect(body.assessment.isPsychosocial).toBe(true);
    expect(body.grounding.found).toBe(true);
  });

  it('serves the incident asked for', async () => {
    const first = await getParsed('/api/ai/trace', aiTraceSchema);
    const other = first.choices.at(-1)!.incidentId;
    const body = await getParsed(`/api/ai/trace?incident=${other}`, aiTraceSchema);
    expect(body.incident.incidentId).toBe(other);
  });

  it('rejects an incident id that is not a positive integer', async () => {
    for (const bad of ['abc', '0', '-3', '1.5']) {
      expect((await get(`/api/ai/trace?incident=${bad}`)).status, bad).toBe(400);
    }
  });

  it('serves 404 for an integer that names no classification', async () => {
    expect((await get('/api/ai/trace?incident=999999')).status).toBe(404);
  });
});

describe('GET /api/suppliers', () => {
  it('accounts for every row the file contained', async () => {
    const body = await getParsed('/api/suppliers', supplierResolutionSchema);
    const absorbed = body.companies.reduce((a, c) => a + c.mergedFrom.length, 0);
    expect(body.totals.companies + absorbed).toBe(body.rowsRead);
  });

  it('states the evidence behind each merge rather than only the result', async () => {
    const body = await getParsed('/api/suppliers', supplierResolutionSchema);
    const merged = body.companies.filter((c) => c.mergedFrom.length > 0);
    expect(merged).toHaveLength(2);
    expect(body.totals.provenMerges).toBe(1);
    expect(body.totals.inferredMerges).toBe(1);
    for (const m of merged.flatMap((c) => c.mergedFrom)) {
      expect(['abn', 'name']).toContain(m.matchMethod);
      expect(m.proven).toBe(m.matchMethod === 'abn');
    }
  });
});
