-- Alter PricingMode enum to add new values for TOTAL and SECTION_WISE pricing
ALTER TYPE "PricingMode" ADD VALUE IF NOT EXISTS 'TOTAL';
ALTER TYPE "PricingMode" ADD VALUE IF NOT EXISTS 'SECTION_WISE';

-- Add pricing to Hotel master
ALTER TABLE "hotels" ADD COLUMN IF NOT EXISTS "price" DECIMAL(14,2);
ALTER TABLE "hotels" ADD COLUMN IF NOT EXISTS "currency" VARCHAR(3) DEFAULT 'INR';

-- Add pricing to Cruise master
ALTER TABLE "cruises" ADD COLUMN IF NOT EXISTS "price" DECIMAL(14,2);
ALTER TABLE "cruises" ADD COLUMN IF NOT EXISTS "currency" VARCHAR(3) DEFAULT 'INR';

-- Add pricing to Vehicle master
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "price" DECIMAL(14,2);
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "currency" VARCHAR(3) DEFAULT 'INR';

-- Add pricing to Sightseeing master (JSON array of {label, price})
ALTER TABLE "sightseeings" ADD COLUMN IF NOT EXISTS "pricing" JSONB;

-- Make AddOnService price optional (nullable, no default)
ALTER TABLE "add_on_services" ALTER COLUMN "price" DROP NOT NULL;
ALTER TABLE "add_on_services" ALTER COLUMN "price" DROP DEFAULT;
