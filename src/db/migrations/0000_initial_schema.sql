CREATE TYPE "public"."date_precision" AS ENUM('day', 'month');--> statement-breakpoint
CREATE TYPE "public"."disposition" AS ENUM('promoted', 'flagged', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."finding_action" AS ENUM('fixed', 'flagged', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."finding_severity" AS ENUM('info', 'warning', 'critical');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."supplier_match_method" AS ENUM('abn', 'name');--> statement-breakpoint
CREATE TABLE "data_quality_finding" (
	"id" serial PRIMARY KEY NOT NULL,
	"ingestion_run_id" integer NOT NULL,
	"rule_code" text NOT NULL,
	"severity" "finding_severity" NOT NULL,
	"action" "finding_action" NOT NULL,
	"dataset" text NOT NULL,
	"source_row_id" integer,
	"field" text,
	"original_value" text,
	"corrected_value" text,
	"message" text NOT NULL,
	"rationale" text NOT NULL,
	"detail" jsonb
);
--> statement-breakpoint
CREATE TABLE "electricity_reading" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_row_id" integer NOT NULL,
	"meter_id" text NOT NULL,
	"meter_description" text,
	"period_month" date NOT NULL,
	"consumption_as_recorded" numeric(16, 3) NOT NULL,
	"unit_as_recorded" text NOT NULL,
	"consumption_kwh" numeric(16, 3) NOT NULL,
	"applied_adjustment_id" integer,
	CONSTRAINT "electricity_reading_nonnegative" CHECK ("electricity_reading"."consumption_kwh" >= 0)
);
--> statement-breakpoint
CREATE TABLE "emission_factor" (
	"id" serial PRIMARY KEY NOT NULL,
	"activity_key" text NOT NULL,
	"activity" text NOT NULL,
	"scope" smallint NOT NULL,
	"unit" text NOT NULL,
	"kg_co2e_per_unit" numeric(12, 4) NOT NULL,
	"source" text NOT NULL,
	CONSTRAINT "emission_factor_scope_valid" CHECK ("emission_factor"."scope" in (1, 2, 3)),
	CONSTRAINT "emission_factor_positive" CHECK ("emission_factor"."kg_co2e_per_unit" > 0)
);
--> statement-breakpoint
CREATE TABLE "fuel_delivery" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_row_id" integer NOT NULL,
	"invoice_no" text NOT NULL,
	"delivery_date" date NOT NULL,
	"delivery_date_raw" text NOT NULL,
	"date_precision" date_precision NOT NULL,
	"fuel_type_raw" text NOT NULL,
	"fuel_type_normalised" text NOT NULL,
	"quantity_as_recorded" numeric(14, 3) NOT NULL,
	"unit_as_recorded" text NOT NULL,
	"quantity_litres" numeric(14, 3) NOT NULL,
	"cost_aud" numeric(14, 2),
	"site_area" text,
	"is_credit_note" boolean DEFAULT false NOT NULL,
	"duplicate_of_id" integer,
	CONSTRAINT "fuel_delivery_quantity_nonzero" CHECK ("fuel_delivery"."quantity_litres" <> 0),
	CONSTRAINT "fuel_delivery_negative_is_credit" CHECK ("fuel_delivery"."quantity_litres" > 0 or "fuel_delivery"."is_credit_note" = true)
);
--> statement-breakpoint
CREATE TABLE "incident" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_row_id" integer NOT NULL,
	"source_incident_id" text NOT NULL,
	"incident_date" date NOT NULL,
	"incident_date_raw" text NOT NULL,
	"location" text,
	"type_code" text,
	"severity_raw" text NOT NULL,
	"severity_normalised" smallint,
	"description" text NOT NULL,
	CONSTRAINT "incident_severity_range" CHECK ("incident"."severity_normalised" is null or "incident"."severity_normalised" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "incident_classification" (
	"id" serial PRIMARY KEY NOT NULL,
	"incident_id" integer NOT NULL,
	"category" text NOT NULL,
	"is_psychosocial" boolean NOT NULL,
	"confidence" numeric(4, 3),
	"reasoning" text NOT NULL,
	"evidence_quote" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "incident_classification_confidence_range" CHECK ("incident_classification"."confidence" is null or "incident_classification"."confidence" between 0 and 1)
);
--> statement-breakpoint
CREATE TABLE "incident_label" (
	"id" serial PRIMARY KEY NOT NULL,
	"incident_id" integer NOT NULL,
	"expected_category" text NOT NULL,
	"is_psychosocial" boolean NOT NULL,
	"severity_concern" boolean NOT NULL,
	"rationale" text,
	"labelled_by" text NOT NULL,
	"labelled_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_run" (
	"id" serial PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" "run_status" DEFAULT 'running' NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "meter_adjustment" (
	"id" serial PRIMARY KEY NOT NULL,
	"meter_id" text NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"multiplier" numeric(12, 4) NOT NULL,
	"reason" text NOT NULL,
	"evidence" text NOT NULL,
	CONSTRAINT "meter_adjustment_multiplier_positive" CHECK ("meter_adjustment"."multiplier" > 0),
	CONSTRAINT "meter_adjustment_period_ordered" CHECK ("meter_adjustment"."effective_to" is null or "meter_adjustment"."effective_to" > "meter_adjustment"."effective_from")
);
--> statement-breakpoint
CREATE TABLE "severity_flag" (
	"id" serial PRIMARY KEY NOT NULL,
	"incident_id" integer NOT NULL,
	"recorded_severity" smallint,
	"suggested_severity" smallint,
	"is_inconsistent" boolean NOT NULL,
	"confidence" numeric(4, 3),
	"reasoning" text NOT NULL,
	"evidence_quote" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "severity_flag_confidence_range" CHECK ("severity_flag"."confidence" is null or "severity_flag"."confidence" between 0 and 1)
);
--> statement-breakpoint
CREATE TABLE "severity_scale" (
	"raw_value" text PRIMARY KEY NOT NULL,
	"normalised" smallint NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "source_file" (
	"id" serial PRIMARY KEY NOT NULL,
	"ingestion_run_id" integer NOT NULL,
	"file_name" text NOT NULL,
	"content_hash" text NOT NULL,
	"rows_read" integer DEFAULT 0 NOT NULL,
	"rows_promoted" integer DEFAULT 0 NOT NULL,
	"rows_flagged" integer DEFAULT 0 NOT NULL,
	"rows_rejected" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "source_file_rows_balance" CHECK ("source_file"."rows_read" = "source_file"."rows_promoted" + "source_file"."rows_rejected")
);
--> statement-breakpoint
CREATE TABLE "source_row" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_file_id" integer NOT NULL,
	"row_number" integer NOT NULL,
	"raw" jsonb NOT NULL,
	"row_hash" text NOT NULL,
	"disposition" "disposition" DEFAULT 'promoted' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_row_id" integer NOT NULL,
	"name_raw" text NOT NULL,
	"name_normalised" text NOT NULL,
	"abn_raw" text,
	"abn_digits" text,
	"abn_valid" boolean,
	"category_raw" text,
	"category_normalised" text,
	"fy_spend_aud" numeric(14, 2),
	"canonical_supplier_id" integer,
	"match_method" "supplier_match_method"
);
--> statement-breakpoint
ALTER TABLE "data_quality_finding" ADD CONSTRAINT "data_quality_finding_ingestion_run_id_ingestion_run_id_fk" FOREIGN KEY ("ingestion_run_id") REFERENCES "public"."ingestion_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_quality_finding" ADD CONSTRAINT "data_quality_finding_source_row_id_source_row_id_fk" FOREIGN KEY ("source_row_id") REFERENCES "public"."source_row"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "electricity_reading" ADD CONSTRAINT "electricity_reading_source_row_id_source_row_id_fk" FOREIGN KEY ("source_row_id") REFERENCES "public"."source_row"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "electricity_reading" ADD CONSTRAINT "electricity_reading_applied_adjustment_id_meter_adjustment_id_fk" FOREIGN KEY ("applied_adjustment_id") REFERENCES "public"."meter_adjustment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fuel_delivery" ADD CONSTRAINT "fuel_delivery_source_row_id_source_row_id_fk" FOREIGN KEY ("source_row_id") REFERENCES "public"."source_row"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fuel_delivery" ADD CONSTRAINT "fuel_delivery_duplicate_of_id_fuel_delivery_id_fk" FOREIGN KEY ("duplicate_of_id") REFERENCES "public"."fuel_delivery"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident" ADD CONSTRAINT "incident_source_row_id_source_row_id_fk" FOREIGN KEY ("source_row_id") REFERENCES "public"."source_row"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_classification" ADD CONSTRAINT "incident_classification_incident_id_incident_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incident"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_label" ADD CONSTRAINT "incident_label_incident_id_incident_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incident"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "severity_flag" ADD CONSTRAINT "severity_flag_incident_id_incident_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incident"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_file" ADD CONSTRAINT "source_file_ingestion_run_id_ingestion_run_id_fk" FOREIGN KEY ("ingestion_run_id") REFERENCES "public"."ingestion_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_row" ADD CONSTRAINT "source_row_source_file_id_source_file_id_fk" FOREIGN KEY ("source_file_id") REFERENCES "public"."source_file"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_source_row_id_source_row_id_fk" FOREIGN KEY ("source_row_id") REFERENCES "public"."source_row"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_canonical_supplier_id_supplier_id_fk" FOREIGN KEY ("canonical_supplier_id") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dq_finding_run_idx" ON "data_quality_finding" USING btree ("ingestion_run_id");--> statement-breakpoint
CREATE INDEX "dq_finding_rule_idx" ON "data_quality_finding" USING btree ("rule_code");--> statement-breakpoint
CREATE INDEX "dq_finding_row_idx" ON "data_quality_finding" USING btree ("source_row_id");--> statement-breakpoint
CREATE UNIQUE INDEX "electricity_reading_meter_period_uq" ON "electricity_reading" USING btree ("meter_id","period_month");--> statement-breakpoint
CREATE INDEX "electricity_reading_period_idx" ON "electricity_reading" USING btree ("period_month");--> statement-breakpoint
CREATE UNIQUE INDEX "emission_factor_activity_key_uq" ON "emission_factor" USING btree ("activity_key");--> statement-breakpoint
CREATE INDEX "fuel_delivery_date_idx" ON "fuel_delivery" USING btree ("delivery_date");--> statement-breakpoint
CREATE INDEX "fuel_delivery_invoice_idx" ON "fuel_delivery" USING btree ("invoice_no");--> statement-breakpoint
CREATE INDEX "incident_source_id_idx" ON "incident" USING btree ("source_incident_id");--> statement-breakpoint
CREATE INDEX "incident_date_idx" ON "incident" USING btree ("incident_date");--> statement-breakpoint
CREATE INDEX "incident_classification_incident_idx" ON "incident_classification" USING btree ("incident_id");--> statement-breakpoint
CREATE UNIQUE INDEX "incident_label_incident_uq" ON "incident_label" USING btree ("incident_id");--> statement-breakpoint
CREATE INDEX "severity_flag_incident_idx" ON "severity_flag" USING btree ("incident_id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_file_run_name_uq" ON "source_file" USING btree ("ingestion_run_id","file_name");--> statement-breakpoint
CREATE UNIQUE INDEX "source_row_file_number_uq" ON "source_row" USING btree ("source_file_id","row_number");--> statement-breakpoint
CREATE INDEX "source_row_hash_idx" ON "source_row" USING btree ("row_hash");