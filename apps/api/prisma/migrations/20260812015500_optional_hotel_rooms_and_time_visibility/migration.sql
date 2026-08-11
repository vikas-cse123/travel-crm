-- Hotel room counts are optional per quotation/template stay.
ALTER TABLE "quotation_template_hotel_options"
  ALTER COLUMN "rooms" DROP NOT NULL,
  ALTER COLUMN "rooms" DROP DEFAULT,
  ADD COLUMN "showCheckInTime" BOOLEAN,
  ADD COLUMN "showCheckOutTime" BOOLEAN;

ALTER TABLE "quotation_version_hotel_options"
  ALTER COLUMN "rooms" DROP NOT NULL,
  ALTER COLUMN "rooms" DROP DEFAULT,
  ADD COLUMN "showCheckInTime" BOOLEAN,
  ADD COLUMN "showCheckOutTime" BOOLEAN;
