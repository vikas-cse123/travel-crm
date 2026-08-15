-- AlterTable
ALTER TABLE "users" ADD COLUMN     "searchApiKeyEncrypted" TEXT,
ADD COLUMN     "searchApiKeyKeyVersion" VARCHAR(30);
