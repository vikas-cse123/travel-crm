-- Hotel season / date-range pricing
--
-- Existing hotels keep their base price/currency untouched (no data migration).
-- A season is an additive date-range rate; quotations pick the matching season
-- and fall back to the hotel's base price when none matches.
CREATE TABLE "hotel_seasons" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "hotelId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "price" DECIMAL(14,2),
    "currency" VARCHAR(3) DEFAULT 'INR' NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hotel_seasons_pkey" PRIMARY KEY ("id")
);

-- Non-overlapping date ranges per hotel.
CREATE INDEX "hotel_seasons_companyId_hotelId_idx"
    ON "hotel_seasons" ("companyId", "hotelId");
CREATE INDEX "hotel_seasons_hotelId_startDate_endDate_idx"
    ON "hotel_seasons" ("hotelId", "startDate", "endDate");

ALTER TABLE "hotel_seasons"
    ADD CONSTRAINT "hotel_seasons_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hotel_seasons"
    ADD CONSTRAINT "hotel_seasons_hotelId_fkey"
    FOREIGN KEY ("hotelId") REFERENCES "hotels" ("id") ON DELETE CASCADE ON UPDATE CASCADE;