import { describe, expect, it } from 'vitest';
import { db } from '../../src/db/client.js';
import { aiTrace } from '../../src/domain/aiTrace.js';
import { aiFindings } from '../../src/domain/ai.js';
import { ACTIVE_PROMPT, resolvePrompt } from '../../src/ai/prompt.js';

// The page built on this claims to show the real instruction and a real check,
// not a description of either. These are the assertions behind that claim.
describe('aiTrace', () => {
  it('serves the prompt text that was actually used, not a copy of it', async () => {
    const trace = await aiTrace(db, null);
    expect(trace).not.toBeNull();
    expect(trace!.systemPrompt).toBe(resolvePrompt(ACTIVE_PROMPT).system);
    expect(trace!.promptVersion).toBe(ACTIVE_PROMPT);
  });

  it('offers every classified incident and opens on a psychosocial one', async () => {
    const [trace, findings] = await Promise.all([aiTrace(db, null), aiFindings(db)]);
    expect(trace!.choices).toHaveLength(findings.totals.classified);
    // Ordering puts the interesting cases first, so the page never opens on a
    // routine tyre failure.
    expect(trace!.assessment.isPsychosocial).toBe(true);
  });

  it('locates the quote inside the description it is attributed to', async () => {
    const findings = await aiFindings(db);

    for (const finding of findings.findings) {
      const trace = await aiTrace(db, finding.incidentId);
      const { quote, found, offset } = trace!.grounding;

      expect(found, `${finding.sourceIncidentId} grounding`).toBe(true);
      expect(offset).toBeGreaterThanOrEqual(0);
      // The offset must be usable for highlighting, not merely non-negative.
      expect(
        trace!.incident.description.slice(offset, offset + quote.trim().length),
      ).toBe(quote.trim());
    }
  }, 60_000);

  it('gives the model the description but never the hand-written label', async () => {
    const trace = await aiTrace(db, null);
    expect(trace!.userMessage).toContain(trace!.incident.description);
    expect(trace!.userMessage).toContain(trace!.incident.sourceIncidentId);
    expect(trace!.userMessage.toLowerCase()).not.toContain('expected');
    expect(trace!.userMessage.toLowerCase()).not.toContain('label');
  });

  it('returns nothing for an incident that was never classified', async () => {
    expect(await aiTrace(db, 999_999)).toBeNull();
  });
});
