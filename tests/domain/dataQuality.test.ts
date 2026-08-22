import { describe, expect, it } from 'vitest';
import { db } from '../../src/db/client.js';
import { dataQualityReport, evidenceForRow } from '../../src/domain/dataQuality.js';
import { validateDetail } from '../../src/rules/findingDetail.js';

describe('dataQualityReport', () => {
  it('reports all four source files', async () => {
    const names = (await dataQualityReport(db)).files.map((f) => f.fileName).sort();
    expect(names).toEqual([
      'electricity_meter_readings.csv',
      'fuel_deliveries.csv',
      'incident_register.csv',
      'suppliers.csv',
    ]);
  });

  it('balances every file: rows read equal rows promoted plus rejected', async () => {
    // The claim that nothing is silently discarded, checked through the API
    // rather than trusted from the pipeline.
    for (const f of (await dataQualityReport(db)).files) {
      expect(f.rowsPromoted + f.rowsRejected).toBe(f.rowsRead);
      expect(f.rowsFlagged).toBeLessThanOrEqual(f.rowsPromoted);
    }
  });

  it('reads 315 rows across the four files and rejects none of them', async () => {
    const files = (await dataQualityReport(db)).files;
    expect(files.reduce((a, f) => a + f.rowsRead, 0)).toBe(315);
    expect(files.reduce((a, f) => a + f.rowsRejected, 0)).toBe(0);
  });

  it('splits findings into fixed and flagged, with none rejected', async () => {
    const { totals } = await dataQualityReport(db);
    expect(totals.fixed + totals.flagged + totals.rejected).toBe(totals.findings);
    expect(totals.rejected).toBe(0);
  });

  it('gives every finding the rationale for its action', async () => {
    for (const f of (await dataQualityReport(db)).findings) {
      expect(f.rationale.length).toBeGreaterThan(20);
      expect(f.message.length).toBeGreaterThan(10);
    }
  });

  it('keeps file-level findings unattached to any row', async () => {
    const { findings } = await dataQualityReport(db);
    const fileLevel = findings.filter((f) =>
      ['FUEL_MONTH_GAP', 'FUEL_HEADER_WHITESPACE', 'ELEC_METER_ID_GAP', 'ELEC_SITE_UNMAPPED'].includes(
        f.ruleCode,
      ),
    );
    expect(fileLevel.length).toBeGreaterThan(0);
    for (const f of fileLevel) expect(f.sourceRowId).toBeNull();
  });

  it('attaches every other finding to a real source row', async () => {
    const rowLevel = (await dataQualityReport(db)).findings.filter((f) => f.sourceRowId !== null);
    for (const f of rowLevel) expect(f.sourceRowNumber).not.toBeNull();
  });

  it('stores detail payloads that still match their declared shape', async () => {
    // Guards against a rule changing what it emits without the schema following.
    for (const f of (await dataQualityReport(db)).findings) {
      if (f.detail === null) continue;
      expect(() => validateDetail(f.ruleCode, f.detail)).not.toThrow();
    }
  });

  it('marks the missing meter estimate as illustrative in stored data', async () => {
    const gap = (await dataQualityReport(db)).findings.find(
      (f) => f.ruleCode === 'ELEC_METER_ID_GAP',
    );
    expect(gap?.detail).toMatchObject({
      missingMeterId: 'MTR-06',
      impactTco2e: { isIllustrative: true },
    });
  });
});

describe('evidenceForRow', () => {
  it('returns the credit note exactly as the CSV recorded it', async () => {
    const creditNote = (await dataQualityReport(db)).findings.find(
      (f) => f.ruleCode === 'FUEL_CREDIT_NOTE',
    );
    const evidence = await evidenceForRow(db, creditNote!.sourceRowId!);

    expect(evidence?.fileName).toBe('fuel_deliveries.csv');
    // Raw means raw: the currency symbol and the negative are both still there.
    expect(evidence?.raw['Invoice No']).toBe('INV-41777');
    expect(evidence?.raw.Quantity).toBe('-12500');
    expect(evidence?.raw['Cost (AUD)']).toContain('$');
    expect(evidence?.disposition).toBe('promoted');
  });

  it('returns every finding raised against that row', async () => {
    const creditNote = (await dataQualityReport(db)).findings.find(
      (f) => f.ruleCode === 'FUEL_CREDIT_NOTE',
    );
    const codes = (await evidenceForRow(db, creditNote!.sourceRowId!))!.findings.map(
      (f) => f.ruleCode,
    );
    expect(codes).toContain('FUEL_CREDIT_NOTE');
    expect(codes.length).toBeGreaterThan(1);
  });

  it('returns null for a row that does not exist', async () => {
    expect(await evidenceForRow(db, 999_999)).toBeNull();
  });
});
