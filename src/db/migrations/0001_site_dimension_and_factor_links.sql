CREATE TYPE "public"."match_confidence" AS ENUM('exact', 'inferred', 'unmapped');--> statement-breakpoint
CREATE TABLE "report_period" (
	"period_month" date PRIMARY KEY NOT NULL,
	CONSTRAINT "report_period_is_month_start" CHECK (extract(day from "report_period"."period_month") = 1)
);
--> statement-breakpoint
CREATE TABLE "site" (
	"id" serial PRIMARY KEY NOT NULL,
	"canonical_name" text NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "site_alias" (
	"id" serial PRIMARY KEY NOT NULL,
	"dataset" text NOT NULL,
	"raw_label" text NOT NULL,
	"site_id" integer,
	"match_confidence" "match_confidence" NOT NULL,
	"note" text,
	CONSTRAINT "site_alias_unmapped_has_no_site" CHECK (("site_alias"."match_confidence" = 'unmapped') = ("site_alias"."site_id" is null))
);
--> statement-breakpoint
ALTER TABLE "electricity_reading" ADD COLUMN "site_id" integer;--> statement-breakpoint
ALTER TABLE "electricity_reading" ADD COLUMN "emission_factor_id" integer;--> statement-breakpoint
ALTER TABLE "fuel_delivery" ADD COLUMN "site_id" integer;--> statement-breakpoint
ALTER TABLE "fuel_delivery" ADD COLUMN "emission_factor_id" integer;--> statement-breakpoint
ALTER TABLE "incident" ADD COLUMN "site_id" integer;--> statement-breakpoint
ALTER TABLE "site_alias" ADD CONSTRAINT "site_alias_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "site_canonical_name_uq" ON "site" USING btree ("canonical_name");--> statement-breakpoint
CREATE UNIQUE INDEX "site_alias_dataset_label_uq" ON "site_alias" USING btree ("dataset","raw_label");--> statement-breakpoint
ALTER TABLE "electricity_reading" ADD CONSTRAINT "electricity_reading_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "electricity_reading" ADD CONSTRAINT "electricity_reading_emission_factor_id_emission_factor_id_fk" FOREIGN KEY ("emission_factor_id") REFERENCES "public"."emission_factor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fuel_delivery" ADD CONSTRAINT "fuel_delivery_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fuel_delivery" ADD CONSTRAINT "fuel_delivery_emission_factor_id_emission_factor_id_fk" FOREIGN KEY ("emission_factor_id") REFERENCES "public"."emission_factor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident" ADD CONSTRAINT "incident_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier" RENAME COLUMN "abn_valid" TO "abn_format_valid";
