-- Reference "Inclusions & Exclusions" — single rich-text/HTML blocks.
ALTER TABLE "quotation_versions"
  ADD COLUMN "inclusionsHtml" VARCHAR(8000),
  ADD COLUMN "exclusionsHtml" VARCHAR(8000);
