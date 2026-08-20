-- Add ordered image galleries while preserving every legacy single-image column.
-- NULL means "use the legacy image fields" for existing rows.
ALTER TABLE "destinations" ADD COLUMN "images" JSON;
ALTER TABLE "hotels" ADD COLUMN "images" JSON;
ALTER TABLE "sightseeings" ADD COLUMN "images" JSON;
ALTER TABLE "testimonials" ADD COLUMN "images" JSON;
ALTER TABLE "cruises" ADD COLUMN "images" JSON;
ALTER TABLE "vehicles" ADD COLUMN "images" JSON;

-- Service rows are immutable quotation snapshots: these columns keep Master
-- gallery edits from changing an already-saved quotation.
ALTER TABLE "quotation_version_services" ADD COLUMN "images" JSON;
ALTER TABLE "quotation_version_services" ADD COLUMN "pdfImageUrl" VARCHAR(1000);
