-- Add an optional custom heading for the public quotation weblink hero.
ALTER TABLE "quotation_versions" ADD COLUMN "weblinkHeading" VARCHAR(200);
