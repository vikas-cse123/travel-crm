-- AlterTable
ALTER TABLE "quotation_weblink_views" ADD COLUMN     "connectionDownlink" DOUBLE PRECISION,
ADD COLUMN     "connectionRtt" INTEGER,
ADD COLUMN     "ctaClicks" INTEGER,
ADD COLUMN     "online" BOOLEAN,
ADD COLUMN     "orientation" VARCHAR(24),
ADD COLUMN     "platform" VARCHAR(60),
ADD COLUMN     "screenAvailHeight" INTEGER,
ADD COLUMN     "screenAvailWidth" INTEGER,
ADD COLUMN     "visitorId" VARCHAR(60);
