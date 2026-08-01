-- AlterTable: notes capture the lead stage at creation and can link to the reminder they spawned
ALTER TABLE "query_notes" ADD COLUMN     "leadStage" "LeadStage",
ADD COLUMN     "followUpId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "query_notes_followUpId_key" ON "query_notes"("followUpId");

-- AddForeignKey
ALTER TABLE "query_notes" ADD CONSTRAINT "query_notes_followUpId_fkey" FOREIGN KEY ("followUpId") REFERENCES "query_follow_ups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
