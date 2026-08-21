// Routes parse input, call a domain service, validate the response, return it.
// Arithmetic in here would be a bug - it belongs in domain/.
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { db } from '../db/client.js';
import {
  basisSchema,
  dataQualityReportSchema,
  aiFindingsSchema,
  evidenceSchema,
  incidentSummarySchema,
  incidentTrendSchema,
  monthlyEmissionsSchema,
} from '../contracts/index.js';
import { monthlyEmissions } from '../domain/emissions.js';
import { incidentSummary, incidentTrend } from '../domain/incidents.js';
import { dataQualityReport, evidenceForRow } from '../domain/dataQuality.js';
import { aiFindings } from '../domain/ai.js';

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

api.get('/incidents/summary', async (_req, res) => {
  res.json(incidentSummarySchema.parse(await incidentSummary(db)));
});

api.get('/incidents/trends', async (_req, res) => {
  res.json(incidentTrendSchema.parse(await incidentTrend(db)));
});

api.get('/ai/findings', async (_req, res) => {
  res.json(aiFindingsSchema.parse(await aiFindings(db)));
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
