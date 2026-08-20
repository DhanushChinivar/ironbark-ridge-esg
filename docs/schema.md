# Database schema

Seventeen tables, twenty foreign keys. Generated from `src/db/schema.ts`; the
diagram below draws every foreign key that exists and no relationship that does
not.

Two things it deliberately does *not* connect:

- **`supplier` and `fuel_delivery`.** `fuel_deliveries.csv` has no supplier
  column, so there is no row-level link between a delivery and who supplied it.
  Reconciliation against declared spend is aggregate-only.
- **`report_period` and `severity_scale`.** Both are joined by key rather than
  by foreign key, so they stand alone.

```mermaid
erDiagram
  INGESTION_RUN ||--o{ SOURCE_FILE : "one per CSV"
  INGESTION_RUN ||--o{ DATA_QUALITY_FINDING : raised_in
  SOURCE_FILE   ||--o{ SOURCE_ROW : "every line"

  SOURCE_ROW ||--o| SUPPLIER : promotes
  SOURCE_ROW ||--o| FUEL_DELIVERY : promotes
  SOURCE_ROW ||--o| ELECTRICITY_READING : promotes
  SOURCE_ROW ||--o| INCIDENT : promotes
  SOURCE_ROW ||--o{ DATA_QUALITY_FINDING : evidence_for

  SUPPLIER      ||--o| SUPPLIER : canonical_link
  FUEL_DELIVERY ||--o| FUEL_DELIVERY : duplicate_of

  EMISSION_FACTOR  ||--o{ FUEL_DELIVERY : applied_to
  EMISSION_FACTOR  ||--o{ ELECTRICITY_READING : applied_to
  METER_ADJUSTMENT ||--o{ ELECTRICITY_READING : corrects

  SITE ||--o{ SITE_ALIAS : resolves
  SITE ||--o{ FUEL_DELIVERY : located_at
  SITE ||--o{ ELECTRICITY_READING : located_at
  SITE ||--o{ INCIDENT : located_at

  INCIDENT ||--o| INCIDENT_LABEL : ground_truth
  INCIDENT ||--o{ INCIDENT_CLASSIFICATION : ai_category
  INCIDENT ||--o{ SEVERITY_FLAG : ai_severity_check

  INGESTION_RUN {
    serial id PK
    timestamptz started_at
    timestamptz finished_at
    enum status
    text notes
  }

  SOURCE_FILE {
    serial id PK
    int ingestion_run_id FK
    text file_name
    text content_hash
    int rows_read
    int rows_promoted
    int rows_flagged
    int rows_rejected
  }

  SOURCE_ROW {
    serial id PK
    int source_file_id FK
    int row_number
    jsonb raw
    text row_hash
    enum disposition
  }

  EMISSION_FACTOR {
    serial id PK
    text activity_key UK
    text activity
    smallint scope
    text unit
    numeric kg_co2e_per_unit
    text source
  }

  SEVERITY_SCALE {
    text raw_value PK
    smallint normalised
    text note
  }

  METER_ADJUSTMENT {
    serial id PK
    text meter_id
    date effective_from
    date effective_to
    numeric multiplier
    text reason
    text evidence
  }

  SITE {
    serial id PK
    text canonical_name UK
    text description
  }

  SITE_ALIAS {
    serial id PK
    text dataset
    text raw_label
    int site_id FK
    enum match_confidence
    text note
  }

  REPORT_PERIOD {
    date period_month PK
  }

  SUPPLIER {
    serial id PK
    int source_row_id FK
    text name_raw
    text name_normalised
    text abn_raw
    text abn_digits
    bool abn_format_valid
    text category_raw
    text category_normalised
    numeric fy_spend_aud
    int canonical_supplier_id FK
    enum match_method
  }

  FUEL_DELIVERY {
    serial id PK
    int source_row_id FK
    text invoice_no
    date delivery_date
    text delivery_date_raw
    enum date_precision
    text fuel_type_raw
    text fuel_type_normalised
    numeric quantity_as_recorded
    text unit_as_recorded
    numeric quantity_litres
    numeric cost_aud
    text site_area
    int site_id FK
    int emission_factor_id FK
    bool is_credit_note
    int duplicate_of_id FK
  }

  ELECTRICITY_READING {
    serial id PK
    int source_row_id FK
    text meter_id
    text meter_description
    date period_month
    numeric consumption_as_recorded
    text unit_as_recorded
    numeric consumption_kwh
    int applied_adjustment_id FK
    int site_id FK
    int emission_factor_id FK
  }

  INCIDENT {
    serial id PK
    int source_row_id FK
    text source_incident_id
    date incident_date
    text incident_date_raw
    text location
    int site_id FK
    text type_code
    text severity_raw
    smallint severity_normalised
    text description
  }

  DATA_QUALITY_FINDING {
    serial id PK
    int ingestion_run_id FK
    text rule_code
    enum severity
    enum action
    text dataset
    int source_row_id FK
    text field
    text original_value
    text corrected_value
    text message
    text rationale
    jsonb detail
  }

  INCIDENT_LABEL {
    serial id PK
    int incident_id FK
    text expected_category
    bool is_psychosocial
    bool severity_concern
    text rationale
    text labelled_by
    timestamptz labelled_at
  }

  INCIDENT_CLASSIFICATION {
    serial id PK
    int incident_id FK
    text category
    bool is_psychosocial
    numeric confidence
    text reasoning
    text evidence_quote
    text model
    text prompt_version
    timestamptz created_at
  }

  SEVERITY_FLAG {
    serial id PK
    int incident_id FK
    smallint recorded_severity
    smallint suggested_severity
    bool is_inconsistent
    numeric confidence
    text reasoning
    text evidence_quote
    text model
    text prompt_version
    timestamptz created_at
  }
```

## Reading it

**Raw is immutable.** Every CSV line lands in `source_row` as jsonb and is never
edited. Cleaning promotes a corrected copy into a typed table beside it, and
records what changed in `data_quality_finding`. The `*_as_recorded` columns keep
the original value next to the canonical one, so "12.5 kL became 12,500 L" is a
column pair rather than a lost transformation.

**One CSV line promotes to exactly one domain row.** `source_row_id` is unique
in all four promoted tables, so a re-run ingest cannot double-count.

**Inferences are marked as inferences.** `match_method` says whether two
supplier records were proved identical by ABN or only matched on name.
`match_confidence` says whether a location label resolved exactly, was inferred,
or maps to nothing. `date_precision` says whether a date has a day.

**The AI layer interprets but never asserts.** `evidence_quote` must be an exact
substring of the incident description, or the classification is rejected.
`incident_label` holds hand-written ground truth, so the classifier can be
scored rather than trusted.

## Constraints worth knowing about

| Constraint | Why |
|---|---|
| `quantity_litres <> 0` | Not `> 0`. INV-41777 is a credit note; rejecting it would overstate Scope 1 by 12,500 litres of diesel. |
| `quantity_litres > 0 OR is_credit_note` | Negatives allowed only once identified. |
| `rows_read = rows_promoted + rows_rejected` | The pipeline cannot silently drop a row. |
| `rows_flagged <= rows_promoted` | Flagged is a subset, not a fourth outcome. |
| `severity_normalised BETWEEN 1 AND 5`, nullable | An unmappable severity stays null rather than being coerced. |
| `(match_confidence = 'unmapped') = (site_id IS NULL)` | An alias cannot claim a confidence it does not have. |
| `UNIQUE (source_row_id)` on all four promoted tables | One line, one row. |
| no `UNIQUE` on `source_incident_id` | `INC-2025-011` names two different incidents. The business key is not a key. |
