ALTER TABLE "faqs" ALTER COLUMN "destinations" TYPE JSONB USING "destinations"::jsonb;
