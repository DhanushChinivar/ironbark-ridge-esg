// Routes parse input, call a domain service, validate the response, return it.
// Arithmetic in here would be a bug - it belongs in domain/.
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { db } from '../db/client.js';
import {
  basisSchema,
  dataQualityReportSchema,
  supplierResolutionSchema,
  emissionsCalculationSchema,
  aiFindingsSchema,
  aiTraceSchema,
  evidenceSchema,
  incidentSummarySchema,
  incidentTrendSchema,
  monthlyEmissionsSchema,
} from '../contracts/index.js';
import { monthlyEmissions } from '../domain/emissions.js';
import { emissionsCalculation } from '../domain/calculation.js';
import { incidentSummary, incidentTrend } from '../domain/incidents.js';
import { dataQualityReport, evidenceForRow } from '../domain/dataQuality.js';
import { aiFindings } from '../domain/ai.js';
import { aiTrace } from '../domain/aiTrace.js';
import { supplierResolution } from '../domain/suppliers.js';

const api = express.Router();

api.get('/health', (_req, res) => {
  res.json({ ok: true });
});

api.get('/emissions/monthly', async (req, res) => {
  const basis = basisSchema.safeParse(req.query.basis ?? 'corrected');
  if (!basis.success) {
    res.status(400).json({ error: 'basis must be "corrected" or "as_reported"' });
    return;
  }
  const data = await monthlyEmissions(db, basis.data);
  res.json(monthlyEmissionsSchema.parse(data));
});

// The same month the dashboard charts, with the arithmetic left unrolled.
api.get('/emissions/calculation', async (req, res) => {
  const basis = basisSchema.safeParse(req.query.basis ?? 'corrected');
  if (!basis.success) {
    res.status(400).json({ error: 'basis must be "corrected" or "as_reported"' });
    return;
  }

  const month = String(req.query.month ?? '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    res.status(400).json({ error: 'month must be YYYY-MM' });
    return;
  }

  const data = await emissionsCalculation(db, month, basis.data);
  if (!data.availableMonths.includes(month)) {
    res.status(404).json({ error: `No reporting period ${month}` });
    return;
  }

  res.json(emissionsCalculationSchema.parse(data));
});

api.get('/incidents/summary', async (_req, res) => {
  res.json(incidentSummarySchema.parse(await incidentSummary(db)));
});

api.get('/incidents/trends', async (_req, res) => {
  res.json(incidentTrendSchema.parse(await incidentTrend(db)));
});

api.get('/ai/findings', async (_req, res) => {
  res.json(aiFindingsSchema.parse(await aiFindings(db)));
});

// How one classification was reached. Omit the id to open on the first finding.
api.get('/ai/trace', async (req, res) => {
  const raw = req.query.incident;
  let incidentId: number | null = null;

  if (raw !== undefined) {
    incidentId = Number(raw);
    if (!Number.isInteger(incidentId) || incidentId < 1) {
      res.status(400).json({ error: 'incident must be an integer' });
      return;
    }
  }

  const trace = await aiTrace(db, incidentId);
  if (!trace) {
    res.status(404).json({ error: 'No classification for that incident' });
    return;
  }

  res.json(aiTraceSchema.parse(trace));
});

// Suppliers resolve among themselves and join nothing else: there is no
// supplier column in the delivery file to join on. Its own endpoint, then.
api.get('/suppliers', async (_req, res) => {
  res.json(supplierResolutionSchema.parse(await supplierResolution(db)));
});

api.get('/data-quality', async (_req, res) => {
  res.json(dataQualityReportSchema.parse(await dataQualityReport(db)));
});

// Findings name a source row; this hands back that row and its findings.
api.get('/evidence/:sourceRowId', async (req, res) => {
  const id = Number(req.params.sourceRowId);
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: 'sourceRowId must be an integer' });
    return;
  }

  const evidence = await evidenceForRow(db, id);
  if (!evidence) {
    res.status(404).json({ error: `No source row ${id}` });
    return;
  }

  res.json(evidenceSchema.parse(evidence));
});

export const app = express();

app.use(cors());
app.use('/api', api);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Express 5 forwards a rejected promise here on its own, so the routes above do
// not need try/catch.
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal error' });
});
