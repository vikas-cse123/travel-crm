-- FAQ master (tenant-scoped, like Testimonial)
CREATE TABLE "faqs" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "question" VARCHAR(500) NOT NULL,
    "answer" TEXT NOT NULL,
    "status" "MasterStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" UUID NOT NULL,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "faqs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "faqs_companyId_status_deletedAt_idx" ON "faqs"("companyId", "status", "deletedAt");
CREATE INDEX "faqs_companyId_createdAt_idx" ON "faqs"("companyId", "createdAt");
CREATE INDEX "faqs_createdById_idx" ON "faqs"("createdById");
CREATE INDEX "faqs_updatedById_idx" ON "faqs"("updatedById");

ALTER TABLE "faqs" ADD CONSTRAINT "faqs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "faqs" ADD CONSTRAINT "faqs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "faqs" ADD CONSTRAINT "faqs_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
