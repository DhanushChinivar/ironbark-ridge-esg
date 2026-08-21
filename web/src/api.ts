import {
  aiFindingsSchema,
  dataQualityReportSchema,
  evidenceSchema,
  incidentSummarySchema,
  incidentTrendSchema,
  monthlyEmissionsSchema,
  type Basis,
} from '@contracts';

async function get<T>(path: string, schema: { parse: (v: unknown) => T }): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} returned ${res.status}`);
  // Parsed against the same schema the API validated on the way out, so a shape
  // change surfaces here rather than as a blank panel.
  return schema.parse(await res.json());
}

export const api = {
  emissions: (basis: Basis = 'corrected') =>
    get(`/api/emissions/monthly?basis=${basis}`, monthlyEmissionsSchema),
  incidentSummary: () => get('/api/incidents/summary', incidentSummarySchema),
  incidentTrends: () => get('/api/incidents/trends', incidentTrendSchema),
  dataQuality: () => get('/api/data-quality', dataQualityReportSchema),
  aiFindings: () => get('/api/ai/findings', aiFindingsSchema),
  evidence: (sourceRowId: number) => get(`/api/evidence/${sourceRowId}`, evidenceSchema),
};
