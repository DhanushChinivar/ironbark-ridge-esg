// Ground truth for all 42 incidents, applying docs/ai-labelling-rubric.md.
// Committed before the prompt exists - labels written after seeing model output
// would be fitted to it. Keyed on id plus date, since INC-2025-011 names two
// different events.

export const LABELLED_BY = 'dhanush';

export interface IncidentLabelInput {
  sourceIncidentId: string;
  incidentDate: string;
  expectedCategory: string;
  isPsychosocial: boolean;
  severityConcern: boolean;
  rationale: string;
}

export const INCIDENT_LABELS: IncidentLabelInput[] = [
  { sourceIncidentId: 'INC-2025-002', incidentDate: '2025-01-22', expectedCategory: 'dust_air_quality', isPsychosocial: false, severityConcern: false, rationale: 'Dust exceedance with a control offline. No stated health outcome.' },
  { sourceIncidentId: 'INC-2025-001', incidentDate: '2025-01-26', expectedCategory: 'vehicle', isPsychosocial: false, severityConcern: false, rationale: 'Tyre failure, controlled stop, no injury.' },
  { sourceIncidentId: 'INC-2025-003', incidentDate: '2025-02-10', expectedCategory: 'vehicle', isPsychosocial: false, severityConcern: false, rationale: 'Tyre failure, controlled stop, no injury.' },
  { sourceIncidentId: 'INC-2025-004', incidentDate: '2025-02-14', expectedCategory: 'equipment', isPsychosocial: false, severityConcern: false, rationale: 'Plant failure, machine stood down. No injury.' },
  { sourceIncidentId: 'INC-2025-005', incidentDate: '2025-03-28', expectedCategory: 'slip_trip_fall', isPsychosocial: false, severityConcern: false, rationale: 'Graze treated with first aid; first aid alone does not meet the threshold.' },
  { sourceIncidentId: 'INC-2025-006', incidentDate: '2025-03-28', expectedCategory: 'slip_trip_fall', isPsychosocial: false, severityConcern: false, rationale: 'Trip hazard tagged, no injury.' },
  { sourceIncidentId: 'INC-2025-007', incidentDate: '2025-03-28', expectedCategory: 'dust_air_quality', isPsychosocial: false, severityConcern: false, rationale: 'Respiratory irritation reported, RPE check completed. No treatment stated.' },
  { sourceIncidentId: 'INC-2025-009', incidentDate: '2025-04-17', expectedCategory: 'environmental', isPsychosocial: false, severityConcern: false, rationale: 'Hydrocarbon sheen, spill kit deployed.' },
  { sourceIncidentId: 'INC-2025-008', incidentDate: '2025-04-25', expectedCategory: 'vehicle', isPsychosocial: false, severityConcern: false, rationale: 'Haul truck and water cart interaction without positive communications.' },
  { sourceIncidentId: 'INC-2025-010', incidentDate: '2025-05-08', expectedCategory: 'environmental', isPsychosocial: false, severityConcern: false, rationale: 'Hydrocarbon sheen, spill kit deployed.' },

  // fracture and surgery, recorded at severity 1
  { sourceIncidentId: 'INC-2025-118', incidentDate: '2025-05-22', expectedCategory: 'slip_trip_fall', isPsychosocial: false, severityConcern: true, rationale: 'Fall from ladder, fractured forearm, hospital transport for surgery, recorded at severity 1.' },

  { sourceIncidentId: 'INC-2025-011', incidentDate: '2025-06-02', expectedCategory: 'vehicle', isPsychosocial: false, severityConcern: false, rationale: 'Speeding detected by IVMS, driver coached.' },
  { sourceIncidentId: 'INC-2025-011', incidentDate: '2025-06-19', expectedCategory: 'environmental', isPsychosocial: false, severityConcern: false, rationale: 'Minor coolant leak contained in bunding. Shares its identifier with a different incident.' },
  { sourceIncidentId: 'INC-2025-012', incidentDate: '2025-07-03', expectedCategory: 'vehicle', isPsychosocial: false, severityConcern: false, rationale: 'Speeding detected by IVMS, driver coached.' },

  { sourceIncidentId: 'INC-2025-127', incidentDate: '2025-07-08', expectedCategory: 'psychosocial', isPsychosocial: true, severityConcern: true, rationale: 'Repeated verbal abuse from a supervisor over weeks: bullying and aggression under the Code. Names anxiety, recorded at severity 1.' },

  { sourceIncidentId: 'INC-2025-013', incidentDate: '2025-08-04', expectedCategory: 'environmental', isPsychosocial: false, severityConcern: false, rationale: 'Hydrocarbon sheen, spill kit deployed.' },
  { sourceIncidentId: 'INC-2025-014', incidentDate: '2025-08-26', expectedCategory: 'dust_air_quality', isPsychosocial: false, severityConcern: false, rationale: 'Dust exceedance with a control offline.' },
  { sourceIncidentId: 'INC-2025-016', incidentDate: '2025-09-23', expectedCategory: 'vehicle', isPsychosocial: false, severityConcern: false, rationale: 'Tyre failure, controlled stop, no injury.' },
  { sourceIncidentId: 'INC-2025-015', incidentDate: '2025-09-27', expectedCategory: 'environmental', isPsychosocial: false, severityConcern: false, rationale: 'Hydrocarbon sheen, spill kit deployed.' },

  // sutures and an LTI, also recorded at severity 1
  { sourceIncidentId: 'INC-2025-141', incidentDate: '2025-09-30', expectedCategory: 'equipment', isPsychosocial: false, severityConcern: true, rationale: 'Pinch point during belt maintenance, two fingers lacerated requiring sutures, LTI recorded, severity 1.' },

  { sourceIncidentId: 'INC-2025-017', incidentDate: '2025-10-03', expectedCategory: 'environmental', isPsychosocial: false, severityConcern: false, rationale: 'Hydrocarbon sheen, spill kit deployed.' },
  { sourceIncidentId: 'INC-2025-018', incidentDate: '2025-11-24', expectedCategory: 'equipment', isPsychosocial: false, severityConcern: false, rationale: 'Plant failure, machine stood down. No injury.' },
  { sourceIncidentId: 'INC-2025-019', incidentDate: '2025-12-10', expectedCategory: 'vehicle', isPsychosocial: false, severityConcern: false, rationale: 'Tyre failure, controlled stop, no injury.' },

  { sourceIncidentId: 'INC-2025-152', incidentDate: '2025-12-11', expectedCategory: 'psychosocial', isPsychosocial: true, severityConcern: false, rationale: 'Sustained overtime and understaffing: job demands under the Code. Recorded at severity 2, which the rubric does not flag.' },

  { sourceIncidentId: 'INC-2026-020', incidentDate: '2026-01-14', expectedCategory: 'equipment', isPsychosocial: false, severityConcern: false, rationale: 'Hose failure caused the release, so the hazard is equipment rather than environmental.' },

  { sourceIncidentId: 'INC-2026-109', incidentDate: '2026-02-03', expectedCategory: 'psychosocial', isPsychosocial: true, severityConcern: true, rationale: 'Exclusion from information and decisions after raising a safety concern: poor support and poor organisational justice. Names ongoing stress and poor sleep, recorded at severity 1.' },

  { sourceIncidentId: 'INC-2026-021', incidentDate: '2026-02-04', expectedCategory: 'vehicle', isPsychosocial: false, severityConcern: false, rationale: 'Haul truck and water cart interaction without positive communications.' },
  { sourceIncidentId: 'INC-2026-022', incidentDate: '2026-02-18', expectedCategory: 'environmental', isPsychosocial: false, severityConcern: false, rationale: 'Sediment dam exceeded trigger after storm, pumping commenced.' },
  { sourceIncidentId: 'INC-2026-025', incidentDate: '2026-03-06', expectedCategory: 'vehicle', isPsychosocial: false, severityConcern: false, rationale: 'Speeding detected by IVMS, driver coached.' },

  { sourceIncidentId: 'INC-2026-131', incidentDate: '2026-03-06', expectedCategory: 'infrastructure', isPsychosocial: false, severityConcern: false, rationale: 'Grid supply lost, generators run for three weeks. A site services failure, not a personal hazard.' },

  { sourceIncidentId: 'INC-2026-024', incidentDate: '2026-03-20', expectedCategory: 'vehicle', isPsychosocial: false, severityConcern: false, rationale: 'Reversing contact with a bund wall, no injury.' },
  { sourceIncidentId: 'INC-2026-023', incidentDate: '2026-03-23', expectedCategory: 'equipment', isPsychosocial: false, severityConcern: false, rationale: 'Hose failure caused the release, so the hazard is equipment.' },

  { sourceIncidentId: 'INC-2026-134', incidentDate: '2026-03-24', expectedCategory: 'psychosocial', isPsychosocial: true, severityConcern: false, rationale: 'Fatigue across multiple crews after extended shifts covering generator operations: job demands under the Code. Recorded at severity 2.' },

  { sourceIncidentId: 'INC-2026-026', incidentDate: '2026-04-03', expectedCategory: 'dust_air_quality', isPsychosocial: false, severityConcern: false, rationale: 'Dust exceedance with a control offline.' },
  { sourceIncidentId: 'INC-2026-028', incidentDate: '2026-04-13', expectedCategory: 'vehicle', isPsychosocial: false, severityConcern: false, rationale: 'Reversing contact with a bund wall, no injury.' },
  { sourceIncidentId: 'INC-2026-027', incidentDate: '2026-04-26', expectedCategory: 'equipment', isPsychosocial: false, severityConcern: false, rationale: 'Plant failure, machine stood down. No injury.' },
  { sourceIncidentId: 'INC-2026-029', incidentDate: '2026-05-12', expectedCategory: 'vehicle', isPsychosocial: false, severityConcern: false, rationale: 'Speeding detected by IVMS, driver coached.' },
  { sourceIncidentId: 'INC-2026-031', incidentDate: '2026-05-22', expectedCategory: 'dust_air_quality', isPsychosocial: false, severityConcern: false, rationale: 'Respiratory irritation reported, RPE check completed.' },
  { sourceIncidentId: 'INC-2026-030', incidentDate: '2026-05-26', expectedCategory: 'dust_air_quality', isPsychosocial: false, severityConcern: false, rationale: 'Dust exceedance with a control offline.' },
  { sourceIncidentId: 'INC-2026-032', incidentDate: '2026-06-11', expectedCategory: 'vehicle', isPsychosocial: false, severityConcern: false, rationale: 'Tyre failure, controlled stop, no injury.' },
  { sourceIncidentId: 'INC-2026-033', incidentDate: '2026-06-11', expectedCategory: 'equipment', isPsychosocial: false, severityConcern: false, rationale: 'Plant failure, machine stood down. No injury.' },
  { sourceIncidentId: 'INC-2026-034', incidentDate: '2026-06-25', expectedCategory: 'dropped_object', isPsychosocial: false, severityConcern: false, rationale: 'Hand tool fell from a walkway, exclusion zone established, no injury.' },
];

export const CATEGORIES = [
  'vehicle',
  'equipment',
  'environmental',
  'dust_air_quality',
  'slip_trip_fall',
  'dropped_object',
  'psychosocial',
  'infrastructure',
] as const;
