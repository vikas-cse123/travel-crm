-- Reference "Flight" — structured journeys/segments stored as JSON.
ALTER TABLE "quotation_versions" ADD COLUMN "flightDetails" JSONB;
