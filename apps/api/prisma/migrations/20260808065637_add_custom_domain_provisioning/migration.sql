-- AlterTable
ALTER TABLE "custom_domains" ADD COLUMN     "activatedAt" TIMESTAMP(3),
ADD COLUMN     "certificateArn" VARCHAR(2048),
ADD COLUMN     "certificateValidationName" VARCHAR(253),
ADD COLUMN     "certificateValidationValue" VARCHAR(253),
ADD COLUMN     "dnsVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "lastCheckedAt" TIMESTAMP(3),
ADD COLUMN     "lastError" VARCHAR(500);
