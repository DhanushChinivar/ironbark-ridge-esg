import { describe, expect, it } from 'vitest';
import {
  applyIncidentRules,
  parseIncidentDate,
  severityByDescription,
  type RawIncidentRow,
} from '../../src/rules/incidents.js';

// Only the globally valid mappings, as seeded. "Low" is deliberately absent.
const SCALE = new Map([
  ['1', 1],
  ['2', 2],
  ['3', 3],
  ['Medium', 3],
]);

const row = (
  rowNumber: number,
  incident_id: string,
  incident_date: string,
  severity: string,
  description: string,
  type_code = 'VEH',
  location = 'Haul Fleet',
): RawIncidentRow => ({
  rowNumber,
  incident_id,
  incident_date,
  location,
  type_code,
  severity,
  description,
});

// Real description groups from incident_register.csv, with their real codings.
const DUST = 'Dust exceedance recorded at crusher during shift change, fogger offline.';
const TYRE = 'Service truck tyre blowout on access road, controlled stop, no injury.';
const RAMP = 'Haul truck and water cart interaction on ramp 4, positive comms not obtained';
const COOLANT = 'Minor coolant leak from pump P-118, contained in bunding.';

describe('parseIncidentDate', () => {
  it('reads a day-first date', () => {
    expect(parseIncidentDate('22/01/2025')).toBe('2025-01-22');
  });

  it('passes ISO through unchanged', () => {
    expect(parseIncidentDate('2025-01-22')).toBe('2025-01-22');
  });

  it('rejects an impossible month rather than swapping the components', () => {
    expect(parseIncidentDate('01/22/2025')).toBeNull();
  });

  it('returns null for anything it does not recognise', () => {
    expect(parseIncidentDate('22 Jan 25')).toBeNull();
  });
});

describe('severityByDescription', () => {
  it('resolves a description whose numeric siblings agree', () => {
    const rows = [row(1, 'A', '2025-01-01', '2', DUST), row(2, 'B', '2025-02-01', '2', DUST)];
    expect(severityByDescription(rows).get(DUST)).toBe(2);
  });

  it('resolves to nothing when the siblings disagree', () => {
    const rows = [row(1, 'A', '2025-01-01', '1', DUST), row(2, 'B', '2025-02-01', '3', DUST)];
    expect(severityByDescription(rows).get(DUST)).toBeNull();
  });

  it('ignores textual severities when building the index', () => {
    const rows = [row(1, 'A', '2025-01-01', 'Low', DUST)];
    expect(severityByDescription(rows).has(DUST)).toBe(false);
  });
});

describe('applyIncidentRules', () => {
  /**
   * The heart of it: "Low" means 2 among dust exceedances and 1 among tyre
   * blowouts. Both groups are real, and a global lookup would be wrong for one
   * of them.
   */
  const mixed = [
    row(1, 'INC-2025-002', '22/01/2025', 'Low', DUST, 'DUS'),
    row(2, 'INC-2025-014', '26/08/2025', '2', DUST, 'DUS'),
    row(3, 'INC-2026-026', '03/04/2026', 'Low', DUST, 'DUS'),
    row(4, 'INC-2025-001', '26/01/2025', '1', TYRE),
    row(5, 'INC-2025-003', '10/02/2025', 'Low', TYRE),
    row(6, 'INC-2025-016', '23/09/2025', '1', TYRE),
  ];

  it('resolves "Low" to 2 among dust exceedances', () => {
    const { incidents } = applyIncidentRules(mixed, { severityScale: SCALE });
    expect(incidents.find((i) => i.rowNumber === 1)?.severityNormalised).toBe(2);
    expect(incidents.find((i) => i.rowNumber === 3)?.severityNormalised).toBe(2);
  });

  it('resolves the same "Low" to 1 among tyre blowouts', () => {
    const { incidents } = applyIncidentRules(mixed, { severityScale: SCALE });
    expect(incidents.find((i) => i.rowNumber === 5)?.severityNormalised).toBe(1);
  });

  it('keeps the raw severity beside the resolved number', () => {
    const { incidents } = applyIncidentRules(mixed, { severityScale: SCALE });
    const low = incidents.find((i) => i.rowNumber === 1);
    expect(low?.severityRaw).toBe('Low');
    expect(low?.severityNormalised).toBe(2);
  });

  it('cites the incidents it resolved from', () => {
    const { findings } = applyIncidentRules(mixed, { severityScale: SCALE });
    const resolved = findings.find(
      (f) => f.ruleCode === 'INC_SEVERITY_TEXTUAL' && f.sourceRowNumber === 5,
    );
    expect(resolved?.detail).toMatchObject({
      rawSeverity: 'Low',
      resolvedTo: 1,
      resolvedFromIncidentIds: ['INC-2025-001', 'INC-2025-016'],
    });
  });

  it('leaves severity null when no numeric sibling exists', () => {
    const orphan = [row(1, 'INC-2025-011', '2025-06-02', 'Low', COOLANT, 'EQP')];
    const { incidents, findings } = applyIncidentRules(orphan, { severityScale: SCALE });
    expect(incidents[0]?.severityNormalised).toBeNull();
    expect(incidents[0]?.severityRaw).toBe('Low');
    expect(findings.map((f) => f.ruleCode)).toContain('INC_SEVERITY_UNRESOLVED');
  });

  it('maps a numeric severity directly, raising nothing', () => {
    const { incidents, findings } = applyIncidentRules(
      [row(1, 'INC-2025-001', '2025-01-26', '1', TYRE)],
      { severityScale: SCALE },
    );
    expect(incidents[0]?.severityNormalised).toBe(1);
    expect(findings.filter((f) => f.ruleCode.startsWith('INC_SEVERITY'))).toHaveLength(0);
  });

  it('maps "Medium" from the scale, without needing siblings', () => {
    const { incidents, findings } = applyIncidentRules(
      [row(1, 'INC-2026-021', '04/02/2026', 'Medium', RAMP)],
      { severityScale: SCALE },
    );
    expect(incidents[0]?.severityNormalised).toBe(3);
    expect(findings.filter((f) => f.ruleCode.startsWith('INC_SEVERITY'))).toHaveLength(0);
  });

  it('flags both rows of a reused identifier, and keeps both', () => {
    const collision = [
      row(1, 'INC-2025-011', '02/06/2025', '1', 'LV exceeded speed limit on haul road.'),
      row(2, 'INC-2025-011', '15/07/2025', '1', COOLANT, 'EQP'),
    ];
    const { incidents, findings } = applyIncidentRules(collision, { severityScale: SCALE });
    expect(incidents).toHaveLength(2);
    const flagged = findings.filter((f) => f.ruleCode === 'INC_ID_COLLISION');
    expect(flagged).toHaveLength(2);
    expect(flagged[0]?.detail).toMatchObject({
      incidentId: 'INC-2025-011',
      rowNumbers: [1, 2],
      descriptionsDiffer: true,
    });
  });

  it('does not flag identifiers that are used once', () => {
    const { findings } = applyIncidentRules(mixed, { severityScale: SCALE });
    expect(findings.filter((f) => f.ruleCode === 'INC_ID_COLLISION')).toHaveLength(0);
  });

  it('records the date correction only where the format changed', () => {
    const { findings } = applyIncidentRules(
      [row(1, 'A', '22/01/2025', '1', TYRE), row(2, 'B', '2025-01-23', '1', TYRE)],
      { severityScale: SCALE },
    );
    const dates = findings.filter((f) => f.ruleCode === 'INC_DATE_FORMAT');
    expect(dates).toHaveLength(1);
    expect(dates[0]?.sourceRowNumber).toBe(1);
  });

  it('refuses to guess at an unparseable date', () => {
    expect(() =>
      applyIncidentRules([row(1, 'A', 'last Tuesday', '1', TYRE)], { severityScale: SCALE }),
    ).toThrow(/Unparseable incident date/);
  });
});
