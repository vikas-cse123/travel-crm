-- CreateEnum
CREATE TYPE "SearchApiKeyStatus" AS ENUM ('ACTIVE', 'EXHAUSTED', 'INVALID', 'DISABLED');

-- CreateTable
CREATE TABLE "search_api_keys" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "keyVersion" VARCHAR(30) NOT NULL,
    "keyDigest" VARCHAR(64) NOT NULL,
    "maskedSuffix" VARCHAR(16) NOT NULL,
    "status" "SearchApiKeyStatus" NOT NULL DEFAULT 'ACTIVE',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "search_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_api_usage" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "searchApiKeyId" UUID,
    "type" VARCHAR(20) NOT NULL,
    "engine" VARCHAR(60) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "isFallbackAttempt" BOOLEAN NOT NULL DEFAULT false,
    "maskedKeySuffix" VARCHAR(16),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_api_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "search_api_keys_companyId_userId_status_priority_idx" ON "search_api_keys"("companyId", "userId", "status", "priority");

-- CreateIndex
CREATE INDEX "search_api_keys_userId_priority_idx" ON "search_api_keys"("userId", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "search_api_keys_userId_keyDigest_key" ON "search_api_keys"("userId", "keyDigest");

-- CreateIndex
CREATE INDEX "search_api_usage_companyId_createdAt_idx" ON "search_api_usage"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "search_api_usage_userId_createdAt_idx" ON "search_api_usage"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "search_api_usage_type_createdAt_idx" ON "search_api_usage"("type", "createdAt");

-- CreateIndex
CREATE INDEX "search_api_usage_searchApiKeyId_idx" ON "search_api_usage"("searchApiKeyId");

-- AddForeignKey
ALTER TABLE "search_api_keys" ADD CONSTRAINT "search_api_keys_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_api_keys" ADD CONSTRAINT "search_api_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_api_usage" ADD CONSTRAINT "search_api_usage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_api_usage" ADD CONSTRAINT "search_api_usage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_api_usage" ADD CONSTRAINT "search_api_usage_searchApiKeyId_fkey" FOREIGN KEY ("searchApiKeyId") REFERENCES "search_api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

