-- Reference "Summary & Pricing" — per-passenger package pricing.
ALTER TABLE "quotation_versions"
  ADD COLUMN "perAdultPrice" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "perChildWithBedPrice" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "perChildWithoutBedPrice" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "perInfantPrice" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "taxNote" VARCHAR(200),
  ADD COLUMN "netAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "initialPaymentAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "paymentLink" VARCHAR(500),
  ADD COLUMN "showServiceChargesSeparately" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "markServiceChargesOutside" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "hidePricing" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "showIndividualPricing" BOOLEAN NOT NULL DEFAULT false,
  -- Reference "Inclusions & Exclusions" — policy blocks (rich text/HTML).
  ADD COLUMN "paymentPolicies" VARCHAR(8000),
  ADD COLUMN "cancellationPolicies" VARCHAR(8000),
  ADD COLUMN "bookingTerms" VARCHAR(8000),
  -- Reference "Visa" — single dedicated section.
  ADD COLUMN "includeVisa" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "visaSectionTitle" VARCHAR(200),
  ADD COLUMN "visaAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "visaDestination" VARCHAR(120),
  ADD COLUMN "visaType" VARCHAR(120),
  ADD COLUMN "visaServiceCharge" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "visaGstPercent" DECIMAL(8,4) NOT NULL DEFAULT 0,
  ADD COLUMN "visaVfsCharge" DECIMAL(14,2) NOT NULL DEFAULT 0;
