-- Phase 21: Visa Types and Testimonials masters.
-- Additive and non-destructive: three new tenant-scoped tables plus their
-- ActivityAction values and permission registration. No existing business
-- model is touched; no data is migrated or dropped.

-- AlterEnum
ALTER TYPE "ActivityAction" ADD VALUE 'VISA_TYPE_CREATED';
ALTER TYPE "ActivityAction" ADD VALUE 'VISA_TYPE_UPDATED';
ALTER TYPE "ActivityAction" ADD VALUE 'VISA_TYPE_STATUS_CHANGED';
ALTER TYPE "ActivityAction" ADD VALUE 'VISA_TYPE_ARCHIVED';
ALTER TYPE "ActivityAction" ADD VALUE 'VISA_TYPE_RESTORED';
ALTER TYPE "ActivityAction" ADD VALUE 'TESTIMONIAL_CREATED';
ALTER TYPE "ActivityAction" ADD VALUE 'TESTIMONIAL_UPDATED';
ALTER TYPE "ActivityAction" ADD VALUE 'TESTIMONIAL_STATUS_CHANGED';
ALTER TYPE "ActivityAction" ADD VALUE 'TESTIMONIAL_ARCHIVED';
ALTER TYPE "ActivityAction" ADD VALUE 'TESTIMONIAL_RESTORED';
ALTER TYPE "ActivityAction" ADD VALUE 'TESTIMONIAL_IMAGE_UPLOADED';
ALTER TYPE "ActivityAction" ADD VALUE 'TESTIMONIAL_IMAGE_REPLACED';
ALTER TYPE "ActivityAction" ADD VALUE 'TESTIMONIAL_IMAGE_DELETED';

-- CreateTable
CREATE TABLE "visa_types" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "destinationId" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "normalizedName" VARCHAR(200) NOT NULL,
    "status" "MasterStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" UUID NOT NULL,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "visa_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visa_type_sections" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "visaTypeId" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "content" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "visa_type_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "testimonials" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "clientName" VARCHAR(160),
    "destinationName" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "imageStorageProvider" "StorageProvider",
    "imageBucket" VARCHAR(255),
    "imageObjectKey" VARCHAR(1000),
    "imageFileName" VARCHAR(255),
    "imageMimeType" VARCHAR(120),
    "imageFileSize" INTEGER,
    "imageConfirmedAt" TIMESTAMP(3),
    "pendingImageObjectKey" VARCHAR(1000),
    "pendingImageFileName" VARCHAR(255),
    "pendingImageMimeType" VARCHAR(120),
    "pendingImageFileSize" INTEGER,
    "status" "MasterStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" UUID NOT NULL,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "testimonials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "visa_types_companyId_status_deletedAt_idx" ON "visa_types"("companyId", "status", "deletedAt");
CREATE INDEX "visa_types_companyId_destinationId_idx" ON "visa_types"("companyId", "destinationId");
CREATE INDEX "visa_types_companyId_normalizedName_idx" ON "visa_types"("companyId", "normalizedName");
CREATE INDEX "visa_types_destinationId_idx" ON "visa_types"("destinationId");
CREATE INDEX "visa_types_createdById_idx" ON "visa_types"("createdById");
CREATE INDEX "visa_types_updatedById_idx" ON "visa_types"("updatedById");
-- One active visa-type name per destination (archived rows are excluded so a
-- name can be reused after archiving). Enforced in the DB; the service maps the
-- resulting P2002 to a friendly conflict. Mirrors the other masters' pattern.
CREATE UNIQUE INDEX "visa_types_active_name_unique" ON "visa_types"("companyId", "destinationId", "normalizedName") WHERE "deletedAt" IS NULL;
CREATE INDEX "visa_type_sections_companyId_visaTypeId_idx" ON "visa_type_sections"("companyId", "visaTypeId");
CREATE INDEX "visa_type_sections_visaTypeId_sequence_idx" ON "visa_type_sections"("visaTypeId", "sequence");
CREATE INDEX "testimonials_companyId_status_deletedAt_idx" ON "testimonials"("companyId", "status", "deletedAt");
CREATE INDEX "testimonials_companyId_createdAt_idx" ON "testimonials"("companyId", "createdAt");
CREATE INDEX "testimonials_createdById_idx" ON "testimonials"("createdById");
CREATE INDEX "testimonials_updatedById_idx" ON "testimonials"("updatedById");

-- AddForeignKey
ALTER TABLE "visa_types" ADD CONSTRAINT "visa_types_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "visa_types" ADD CONSTRAINT "visa_types_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "destinations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "visa_types" ADD CONSTRAINT "visa_types_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "visa_types" ADD CONSTRAINT "visa_types_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "visa_type_sections" ADD CONSTRAINT "visa_type_sections_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "visa_type_sections" ADD CONSTRAINT "visa_type_sections_visaTypeId_fkey" FOREIGN KEY ("visaTypeId") REFERENCES "visa_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Register and grant the new masters permissions. Idempotent; mirrors the
-- Phase 13B/13C/13D activation migrations so existing companies keep parity.
-- ---------------------------------------------------------------------------
INSERT INTO "permissions" ("id", "key", "module", "action", "description", "isAvailable", "createdAt") VALUES
  (gen_random_uuid(), 'masters.visa_types.view', 'masters.visa_types', 'view', 'View active visa types', true, NOW()),
  (gen_random_uuid(), 'masters.visa_types.create', 'masters.visa_types', 'create', 'Create visa types', true, NOW()),
  (gen_random_uuid(), 'masters.visa_types.update', 'masters.visa_types', 'update', 'Edit visa types and change status', true, NOW()),
  (gen_random_uuid(), 'masters.visa_types.delete', 'masters.visa_types', 'delete', 'Archive visa types', true, NOW()),
  (gen_random_uuid(), 'masters.testimonials.view', 'masters.testimonials', 'view', 'View active testimonials', true, NOW()),
  (gen_random_uuid(), 'masters.testimonials.create', 'masters.testimonials', 'create', 'Create testimonials', true, NOW()),
  (gen_random_uuid(), 'masters.testimonials.update', 'masters.testimonials', 'update', 'Edit testimonials and change status', true, NOW()),
  (gen_random_uuid(), 'masters.testimonials.delete', 'masters.testimonials', 'delete', 'Archive testimonials', true, NOW()),
  (gen_random_uuid(), 'masters.testimonials.manage_media', 'masters.testimonials', 'manage_media', 'Manage testimonial images', true, NOW())
ON CONFLICT ("key") DO UPDATE SET "module" = EXCLUDED."module", "action" = EXCLUDED."action", "description" = EXCLUDED."description", "isAvailable" = true;

INSERT INTO "role_permissions" ("roleId", "permissionId", "createdAt")
SELECT r."id", p."id", NOW() FROM "roles" r JOIN "permissions" p ON (
  r."name" IN ('Owner', 'Manager')
  OR (r."name" = 'Sales Executive' AND p."key" IN ('masters.visa_types.view','masters.testimonials.view'))
  OR (r."name" = 'Data Entry' AND p."key" IN ('masters.visa_types.view','masters.visa_types.create','masters.visa_types.update','masters.testimonials.view','masters.testimonials.create','masters.testimonials.update','masters.testimonials.manage_media'))
  OR (r."name" = 'View Only' AND p."key" IN ('masters.visa_types.view','masters.testimonials.view'))
)
WHERE r."isSystem" = true AND p."module" IN ('masters.visa_types','masters.testimonials') ON CONFLICT DO NOTHING;

INSERT INTO "permission_template_permissions" ("templateId", "permissionId", "createdAt")
SELECT t."id", p."id", NOW() FROM "permission_templates" t JOIN "permissions" p ON (
  t."name" = 'Manager'
  OR (t."name" = 'Sales Executive' AND p."key" IN ('masters.visa_types.view','masters.testimonials.view'))
  OR (t."name" = 'Data Entry' AND p."key" IN ('masters.visa_types.view','masters.visa_types.create','masters.visa_types.update','masters.testimonials.view','masters.testimonials.create','masters.testimonials.update','masters.testimonials.manage_media'))
  OR (t."name" = 'View Only' AND p."key" IN ('masters.visa_types.view','masters.testimonials.view'))
)
WHERE t."deletedAt" IS NULL AND t."name" IN ('Manager','Sales Executive','Data Entry','View Only')
  AND p."module" IN ('masters.visa_types','masters.testimonials') ON CONFLICT DO NOTHING;
