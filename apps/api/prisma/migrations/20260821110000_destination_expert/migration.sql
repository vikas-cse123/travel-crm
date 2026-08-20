-- Destination Expert: explicit gender for default avatar + expert profile fields, and per-quotation expert config.
-- All columns nullable/default-safe for old rows; no data loss.

-- Create enum for explicit gender (never inferred)
CREATE TYPE "UserGender" AS ENUM ('MALE', 'FEMALE');

-- Add gender + expert profile columns to users
ALTER TABLE "users" ADD COLUMN "gender" "UserGender";
ALTER TABLE "users" ADD COLUMN "jobTitle" VARCHAR(120);
ALTER TABLE "users" ADD COLUMN "bio" TEXT;
ALTER TABLE "users" ADD COLUMN "specialization" VARCHAR(200);
ALTER TABLE "users" ADD COLUMN "yearsOfExperience" INTEGER;
ALTER TABLE "users" ADD COLUMN "tripsPlanned" INTEGER;
ALTER TABLE "users" ADD COLUMN "languages" VARCHAR(200);
ALTER TABLE "users" ADD COLUMN "whatsappNumber" VARCHAR(32);
ALTER TABLE "users" ADD COLUMN "profileImageObjectKey" VARCHAR(1000);
ALTER TABLE "users" ADD COLUMN "profileImageBucket" VARCHAR(255);
ALTER TABLE "users" ADD COLUMN "profileImageStorageProvider" "StorageProvider";
ALTER TABLE "users" ADD COLUMN "profileImageMimeType" VARCHAR(120);
ALTER TABLE "users" ADD COLUMN "profileImageFileSize" INTEGER;
ALTER TABLE "users" ADD COLUMN "profileImageConfirmedAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "pendingProfileImageObjectKey" VARCHAR(1000);
ALTER TABLE "users" ADD COLUMN "pendingProfileImageFileName" VARCHAR(255);
ALTER TABLE "users" ADD COLUMN "pendingProfileImageMimeType" VARCHAR(120);
ALTER TABLE "users" ADD COLUMN "pendingProfileImageFileSize" INTEGER;

-- Per-quotation Destination Expert config (nullable JSON for backward compat)
ALTER TABLE "quotation_versions" ADD COLUMN "destinationExpertConfig" JSON;
