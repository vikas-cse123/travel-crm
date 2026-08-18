-- AlterTable
-- Rich-text Inclusions/Exclusions may legitimately exceed 8000 characters
-- because HTML markup increases the stored length. TEXT removes the artificial
-- cap, matching the template-level policy fields (also @db.Text).
ALTER TABLE "quotation_versions" ALTER COLUMN "inclusionsHtml" SET DATA TYPE TEXT;
ALTER TABLE "quotation_versions" ALTER COLUMN "exclusionsHtml" SET DATA TYPE TEXT;