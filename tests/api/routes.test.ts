import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/api/app.js';
import {
  dataQualityReportSchema,
  evidenceSchema,
  incidentSummarySchema,
  incidentTrendSchema,
  monthlyEmissionsSchema,
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
    const finding = report.findings.find((f) => f.ruleCode === 'FUEL_CREDIT_NOTE');
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
