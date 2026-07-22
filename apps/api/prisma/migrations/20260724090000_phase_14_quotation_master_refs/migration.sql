-- Phase 14: optional travel-master references on quotation and template services.
--
-- Purely additive. Every column is nullable with no default and every foreign
-- key is ON DELETE SET NULL, so:
--   * existing rows remain valid untouched,
--   * archiving or deleting a master never destroys a saved quotation line,
--   * the existing snapshot columns remain the authoritative rendered values.
--
-- Hotel references are NOT added here: hotelId / hotelRoomTypeId /
-- hotelMealPlanId already exist on both hotel-option tables from Phase 13B.
-- Phase 14 activates them at the validator and service layer instead.

ALTER TABLE "quotation_version_services"
  ADD COLUMN "airlineId" UUID,
  ADD COLUMN "cruiseId" UUID,
  ADD COLUMN "cruiseRoomTypeId" UUID,
  ADD COLUMN "vehicleId" UUID,
  ADD COLUMN "sightseeingId" UUID,
  ADD COLUMN "addOnServiceId" UUID;

ALTER TABLE "quotation_template_services"
  ADD COLUMN "airlineId" UUID,
  ADD COLUMN "cruiseId" UUID,
  ADD COLUMN "cruiseRoomTypeId" UUID,
  ADD COLUMN "vehicleId" UUID,
  ADD COLUMN "sightseeingId" UUID,
  ADD COLUMN "addOnServiceId" UUID;

-- Indexes -------------------------------------------------------------------
CREATE INDEX "quotation_version_services_airlineId_idx" ON "quotation_version_services"("airlineId");
CREATE INDEX "quotation_version_services_cruiseId_idx" ON "quotation_version_services"("cruiseId");
CREATE INDEX "quotation_version_services_cruiseRoomTypeId_idx" ON "quotation_version_services"("cruiseRoomTypeId");
CREATE INDEX "quotation_version_services_vehicleId_idx" ON "quotation_version_services"("vehicleId");
CREATE INDEX "quotation_version_services_sightseeingId_idx" ON "quotation_version_services"("sightseeingId");
CREATE INDEX "quotation_version_services_addOnServiceId_idx" ON "quotation_version_services"("addOnServiceId");

CREATE INDEX "quotation_template_services_airlineId_idx" ON "quotation_template_services"("airlineId");
CREATE INDEX "quotation_template_services_cruiseId_idx" ON "quotation_template_services"("cruiseId");
CREATE INDEX "quotation_template_services_cruiseRoomTypeId_idx" ON "quotation_template_services"("cruiseRoomTypeId");
CREATE INDEX "quotation_template_services_vehicleId_idx" ON "quotation_template_services"("vehicleId");
CREATE INDEX "quotation_template_services_sightseeingId_idx" ON "quotation_template_services"("sightseeingId");
CREATE INDEX "quotation_template_services_addOnServiceId_idx" ON "quotation_template_services"("addOnServiceId");

-- Foreign keys --------------------------------------------------------------
ALTER TABLE "quotation_version_services" ADD CONSTRAINT "quotation_version_services_airlineId_fkey" FOREIGN KEY ("airlineId") REFERENCES "airlines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quotation_version_services" ADD CONSTRAINT "quotation_version_services_cruiseId_fkey" FOREIGN KEY ("cruiseId") REFERENCES "cruises"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quotation_version_services" ADD CONSTRAINT "quotation_version_services_cruiseRoomTypeId_fkey" FOREIGN KEY ("cruiseRoomTypeId") REFERENCES "cruise_room_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quotation_version_services" ADD CONSTRAINT "quotation_version_services_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quotation_version_services" ADD CONSTRAINT "quotation_version_services_sightseeingId_fkey" FOREIGN KEY ("sightseeingId") REFERENCES "sightseeings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quotation_version_services" ADD CONSTRAINT "quotation_version_services_addOnServiceId_fkey" FOREIGN KEY ("addOnServiceId") REFERENCES "add_on_services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "quotation_template_services" ADD CONSTRAINT "quotation_template_services_airlineId_fkey" FOREIGN KEY ("airlineId") REFERENCES "airlines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quotation_template_services" ADD CONSTRAINT "quotation_template_services_cruiseId_fkey" FOREIGN KEY ("cruiseId") REFERENCES "cruises"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quotation_template_services" ADD CONSTRAINT "quotation_template_services_cruiseRoomTypeId_fkey" FOREIGN KEY ("cruiseRoomTypeId") REFERENCES "cruise_room_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quotation_template_services" ADD CONSTRAINT "quotation_template_services_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quotation_template_services" ADD CONSTRAINT "quotation_template_services_sightseeingId_fkey" FOREIGN KEY ("sightseeingId") REFERENCES "sightseeings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quotation_template_services" ADD CONSTRAINT "quotation_template_services_addOnServiceId_fkey" FOREIGN KEY ("addOnServiceId") REFERENCES "add_on_services"("id") ON DELETE SET NULL ON UPDATE CASCADE;
