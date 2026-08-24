-- Add profile fields to destination_expert_presets, make image optional (default avatars)
ALTER TABLE "destination_expert_presets" ADD COLUMN "jobTitle" VARCHAR(120);
ALTER TABLE "destination_expert_presets" ADD COLUMN "bio" TEXT;
ALTER TABLE "destination_expert_presets" ADD COLUMN "specialization" VARCHAR(200);
ALTER TABLE "destination_expert_presets" ADD COLUMN "yearsOfExperience" INTEGER;
ALTER TABLE "destination_expert_presets" ADD COLUMN "tripsPlanned" INTEGER;
ALTER TABLE "destination_expert_presets" ADD COLUMN "languages" VARCHAR(200);
ALTER TABLE "destination_expert_presets" ADD COLUMN "gender" "UserGender";
ALTER TABLE "destination_expert_presets" ADD COLUMN "profileImageObjectKey" VARCHAR(1000);
ALTER TABLE "destination_expert_presets" ADD COLUMN "profileImageBucket" VARCHAR(255);
ALTER TABLE "destination_expert_presets" ADD COLUMN "profileImageStorageProvider" "StorageProvider";
ALTER TABLE "destination_expert_presets" ADD COLUMN "profileImageMimeType" VARCHAR(120);
ALTER TABLE "destination_expert_presets" ADD COLUMN "profileImageFileSize" INTEGER;
ALTER TABLE "destination_expert_presets" ADD COLUMN "profileImageConfirmedAt" TIMESTAMP(3);
ALTER TABLE "destination_expert_presets" ADD COLUMN "pendingProfileImageObjectKey" VARCHAR(1000);
ALTER TABLE "destination_expert_presets" ADD COLUMN "pendingProfileImageFileName" VARCHAR(255);
ALTER TABLE "destination_expert_presets" ADD COLUMN "pendingProfileImageMimeType" VARCHAR(120);
ALTER TABLE "destination_expert_presets" ADD COLUMN "pendingProfileImageFileSize" INTEGER;
