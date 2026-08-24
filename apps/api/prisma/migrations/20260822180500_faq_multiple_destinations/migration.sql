-- Migrate single destination column to a multi-destination JSON array
ALTER TABLE "faqs" ADD COLUMN "destinations" JSON;
UPDATE "faqs" SET "destinations" = jsonb_build_array("destination") WHERE "destination" IS NOT NULL;
DROP INDEX IF EXISTS "faqs_companyId_destination_idx";
ALTER TABLE "faqs" DROP COLUMN "destination";
