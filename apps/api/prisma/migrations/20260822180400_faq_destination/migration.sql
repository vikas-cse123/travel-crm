ALTER TABLE "faqs" ADD COLUMN "destination" VARCHAR(200);
CREATE INDEX "faqs_companyId_destination_idx" ON "faqs"("companyId", "destination");
