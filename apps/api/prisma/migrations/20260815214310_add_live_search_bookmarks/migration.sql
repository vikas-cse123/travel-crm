-- CreateTable
CREATE TABLE "live_search_bookmarks" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "provider" VARCHAR(40) NOT NULL,
    "fingerprint" VARCHAR(160) NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "currency" VARCHAR(10) NOT NULL,
    "searchParams" JSONB NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "live_search_bookmarks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "live_search_bookmarks_companyId_type_idx" ON "live_search_bookmarks"("companyId", "type");

-- CreateIndex
CREATE INDEX "live_search_bookmarks_companyId_userId_createdAt_idx" ON "live_search_bookmarks"("companyId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "live_search_bookmarks_userId_createdAt_idx" ON "live_search_bookmarks"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "live_search_bookmarks_userId_fingerprint_key" ON "live_search_bookmarks"("userId", "fingerprint");

-- AddForeignKey
ALTER TABLE "live_search_bookmarks" ADD CONSTRAINT "live_search_bookmarks_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_search_bookmarks" ADD CONSTRAINT "live_search_bookmarks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
