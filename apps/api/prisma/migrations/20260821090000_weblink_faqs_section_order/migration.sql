-- Weblink customization: quotation-specific FAQs and custom section ordering.
-- Both columns are nullable JSON so existing quotations keep the default order
-- and show no FAQs until explicitly configured. No data migration needed.
ALTER TABLE "quotation_versions" ADD COLUMN "faqs" JSON;
ALTER TABLE "quotation_versions" ADD COLUMN "weblinkSectionOrder" JSON;
