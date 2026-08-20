ALTER TABLE "source_row" ALTER COLUMN "disposition" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "source_row" ALTER COLUMN "disposition" SET DEFAULT 'promoted'::text;--> statement-breakpoint
DROP TYPE "public"."disposition";--> statement-breakpoint
CREATE TYPE "public"."disposition" AS ENUM('promoted', 'rejected');--> statement-breakpoint
ALTER TABLE "source_row" ALTER COLUMN "disposition" SET DEFAULT 'promoted'::"public"."disposition";--> statement-breakpoint
ALTER TABLE "source_row" ALTER COLUMN "disposition" SET DATA TYPE "public"."disposition" USING "disposition"::"public"."disposition";--> statement-breakpoint
ALTER TABLE "source_file" ADD CONSTRAINT "source_file_flagged_subset" CHECK ("source_file"."rows_flagged" <= "source_file"."rows_promoted");