-- Company TAN (Tax Deduction Account Number) for Settings → Company Profile → Tax.
-- Purely additive: one nullable VARCHAR(40) column, so existing rows stay valid.

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "tan" VARCHAR(40);
