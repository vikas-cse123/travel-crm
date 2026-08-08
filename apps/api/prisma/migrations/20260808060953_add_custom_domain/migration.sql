-- CreateEnum
CREATE TYPE "CustomDomainStatus" AS ENUM ('PENDING', 'ACTIVE', 'DISABLED');

-- CreateTable
CREATE TABLE "custom_domains" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "hostname" VARCHAR(253) NOT NULL,
    "status" "CustomDomainStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_domains_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "custom_domains_hostname_key" ON "custom_domains"("hostname");

-- CreateIndex
CREATE INDEX "custom_domains_status_idx" ON "custom_domains"("status");

-- CreateIndex
CREATE UNIQUE INDEX "custom_domains_companyId_key" ON "custom_domains"("companyId");

-- AddForeignKey
ALTER TABLE "custom_domains" ADD CONSTRAINT "custom_domains_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
