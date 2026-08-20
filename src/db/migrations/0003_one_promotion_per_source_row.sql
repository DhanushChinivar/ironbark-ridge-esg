CREATE UNIQUE INDEX "electricity_reading_source_row_uq" ON "electricity_reading" USING btree ("source_row_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fuel_delivery_source_row_uq" ON "fuel_delivery" USING btree ("source_row_id");--> statement-breakpoint
CREATE UNIQUE INDEX "incident_source_row_uq" ON "incident" USING btree ("source_row_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_source_row_uq" ON "supplier" USING btree ("source_row_id");