-- Company profile metrics shown in Settings → Company Profile.
-- Purely additive: three nullable INTEGER columns, so existing rows stay valid.

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "operatingSinceYear" INTEGER,
ADD COLUMN     "totalReviews" INTEGER,
ADD COLUMN     "tripsSold" INTEGER;
