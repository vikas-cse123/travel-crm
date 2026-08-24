-- User-level, destination-based Destination Expert presets
CREATE TABLE "destination_expert_presets" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "destination" VARCHAR(120) NOT NULL,
    "heading" VARCHAR(200),
    "customIntroduction" TEXT,
    "whatsappNumber" VARCHAR(32),
    "callNumber" VARCHAR(32),
    "email" VARCHAR(255),
    "showWhatsapp" BOOLEAN NOT NULL DEFAULT true,
    "showCall" BOOLEAN NOT NULL DEFAULT true,
    "showEmail" BOOLEAN NOT NULL DEFAULT true,
    "showExperience" BOOLEAN NOT NULL DEFAULT true,
    "showTripsPlanned" BOOLEAN NOT NULL DEFAULT true,
    "showLanguages" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "destination_expert_presets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "destination_expert_presets_userId_destination_key" ON "destination_expert_presets"("userId", "destination");
CREATE INDEX "destination_expert_presets_companyId_userId_idx" ON "destination_expert_presets"("companyId", "userId");
CREATE INDEX "destination_expert_presets_userId_destination_idx" ON "destination_expert_presets"("userId", "destination");

ALTER TABLE "destination_expert_presets" ADD CONSTRAINT "destination_expert_presets_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "destination_expert_presets" ADD CONSTRAINT "destination_expert_presets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
