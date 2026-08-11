-- AlterTable
ALTER TABLE "quotation_versions" ADD COLUMN     "quickNavSticky" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "showQuickNav" BOOLEAN NOT NULL DEFAULT true;
