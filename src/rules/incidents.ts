// Severity comes in two codings, 1/2/3 and Low/Medium. A lookup table is the
// obvious fix but doesn't work: the register reuses description text, and where
// the same description appears under both codings, "Low" is 2 among dust
// exceedances and 1 among tyre blowouts. One global value would be wrong for one
// of them.
//
// So textual severities are resolved per incident from the numerically coded
// incidents sharing their description. No sibling means severity stays null.
import { finding, type Finding } from './finding.js';

export interface RawIncidentRow {
  rowNumber: number;
  incident_id: string;
  incident_date: string;
  location: string;
  type_code: string;
  severity: string;
  description: string;
}

export interface CleanIncident {
  rowNumber: number;
  sourceIncidentId: string;
  incidentDate: string;
  incidentDateRaw: string;
  location: string;
  typeCode: string;
  severityRaw: string;
  severityNormalised: number | null;
  description: string;
}

export interface IncidentRuleInput {
  /** Globally valid mappings only. "Low" is deliberately absent. */
  severityScale: Map<string, number>;
}

export interface IncidentRuleResult {
  incidents: CleanIncident[];
  findings: Finding[];
}

// Same day-first evidence as the fuel file: no row can be read month-first.
export function parseIncidentDate(raw: string): string | null {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (!slash) return null;
  const [, d, m, y] = slash;
  const month = Number(m);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
}

// Numeric severities indexed by description. Returns a value only where the
// siblings agree; conflicting siblings resolve to nothing rather than a guess.
export function severityByDescription(rows: RawIncidentRow[]): Map<string, number | null> {
  const seen = new Map<string, Set<number>>();
  for (const r of rows) {
    if (!/^\d+$/.test(r.severity.trim())) continue;
    const set = seen.get(r.description) ?? new Set<number>();
    set.add(Number(r.severity));
    seen.set(r.description, set);
  }

  const resolved = new Map<string, number | null>();
  for (const [description, values] of seen) {
    resolved.set(description, values.size === 1 ? [...values][0]! : null);
  }
  return resolved;
}

export function applyIncidentRules(
  rows: RawIncidentRow[],
  input: IncidentRuleInput,
): IncidentRuleResult {
  const findings: Finding[] = [];
  const incidents: CleanIncident[] = [];
  const siblings = severityByDescription(rows);

  for (const r of rows) {
    const incidentDate = parseIncidentDate(r.incident_date);
    if (!incidentDate) {
      throw new Error(`Unparseable incident date on row ${r.rowNumber}: "${r.incident_date}"`);
    }
    if (r.incident_date.trim() !== incidentDate) {
      findings.push(
        finding('INC_DATE_FORMAT', r.rowNumber, {
          field: 'incident_date',
          originalValue: r.incident_date,
          correctedValue: incidentDate,
        }),
      );
    }

    const severityRaw = r.severity.trim();
    let severityNormalised = input.severityScale.get(severityRaw) ?? null;

    if (severityNormalised === null) {
      // Not in the scale, so look for numeric siblings.
      const fromSiblings = siblings.get(r.description) ?? null;
      const detail = {
        rawSeverity: severityRaw,
        resolvedTo: fromSiblings,
        sharedDescription: r.description,
        resolvedFromIncidentIds: rows
          .filter((x) => x.description === r.description && /^\d+$/.test(x.severity.trim()))
          .map((x) => x.incident_id),
      };

      if (fromSiblings !== null) {
        severityNormalised = fromSiblings;
        findings.push(
          finding('INC_SEVERITY_TEXTUAL', r.rowNumber, {
            field: 'severity',
            originalValue: severityRaw,
            correctedValue: String(fromSiblings),
            detail,
          }),
        );
      } else {
        findings.push(
          finding('INC_SEVERITY_UNRESOLVED', r.rowNumber, {
            field: 'severity',
            originalValue: severityRaw,
            detail,
          }),
        );
      }
    }

    incidents.push({
      rowNumber: r.rowNumber,
      sourceIncidentId: r.incident_id,
      incidentDate,
      incidentDateRaw: r.incident_date,
      location: r.location,
      typeCode: r.type_code,
      severityRaw,
      severityNormalised,
      description: r.description,
    });
  }

  flagIdCollisions(rows, findings);
  return { incidents, findings };
}

// One identifier, two different events. Both rows stay - deciding which is
// "really" INC-2025-011 isn't our call.
function flagIdCollisions(rows: RawIncidentRow[], findings: Finding[]): void {
  const byId = new Map<string, RawIncidentRow[]>();
  for (const r of rows) byId.set(r.incident_id, [...(byId.get(r.incident_id) ?? []), r]);

  for (const [incidentId, group] of byId) {
    if (group.length < 2) continue;
    for (const r of group) {
      findings.push(
        finding('INC_ID_COLLISION', r.rowNumber, {
          field: 'incident_id',
          originalValue: incidentId,
          detail: {
            incidentId,
            rowNumbers: group.map((g) => g.rowNumber),
            dates: group.map((g) => g.incident_date),
            descriptionsDiffer: new Set(group.map((g) => g.description)).size > 1,
          },
        }),
      );
    }
  }
}
