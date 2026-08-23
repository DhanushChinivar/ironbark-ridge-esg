-- The source never states that INV-41777 is a credit note; it states a negative
-- quantity against a negative cost. RENAME rather than drop-and-add, so the row
-- that carries the flag keeps it.
ALTER TABLE "fuel_delivery" RENAME COLUMN "is_credit_note" TO "is_negative_adjustment";--> statement-breakpoint
ALTER TABLE "fuel_delivery" DROP CONSTRAINT "fuel_delivery_negative_is_credit";--> statement-breakpoint
ALTER TABLE "fuel_delivery" ADD CONSTRAINT "fuel_delivery_negative_is_adjustment" CHECK ("fuel_delivery"."quantity_litres" > 0 or "fuel_delivery"."is_negative_adjustment" = true);--> statement-breakpoint
ALTER TABLE "fuel_delivery" ADD CONSTRAINT "fuel_delivery_duplicate_not_self" CHECK ("fuel_delivery"."duplicate_of_id" is null or "fuel_delivery"."duplicate_of_id" <> "fuel_delivery"."id");--> statement-breakpoint
ALTER TABLE "severity_flag" ADD CONSTRAINT "severity_flag_recorded_range" CHECK ("severity_flag"."recorded_severity" is null or "severity_flag"."recorded_severity" between 1 and 5);--> statement-breakpoint
ALTER TABLE "severity_flag" ADD CONSTRAINT "severity_flag_suggested_range" CHECK ("severity_flag"."suggested_severity" is null or "severity_flag"."suggested_severity" between 1 and 5);--> statement-breakpoint
-- Findings already written under the old code. Updated in place: rebuilding them
-- would mean re-ingesting, and that cascades away the AI classifications.
UPDATE "data_quality_finding" SET "rule_code" = 'FUEL_NEGATIVE_ACTIVITY' WHERE "rule_code" = 'FUEL_CREDIT_NOTE';
--> statement-breakpoint
-- Findings copy their message and rationale at write time, so the stored copy
-- still asserted the old conclusion. Brought in line with the catalogue.
UPDATE "data_quality_finding" SET
  "message" = 'Delivery recorded with a negative quantity and a negative cost.',
  "rationale" = 'INV-41777 records −12,500 L and −$23,375, at $1.87 per litre, with an invoice number outside the surrounding sequence. Both figures being negative and consistent is the pattern of a reversal rather than a mis-keyed sign, but the file never says so. The row is retained as recorded and flagged for review; rejecting it would overstate Scope 1 by 12,500 litres of diesel, and flipping the sign would understate it by the same amount.'
WHERE "rule_code" = 'FUEL_NEGATIVE_ACTIVITY';
