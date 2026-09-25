-- DropForeignKey
ALTER TABLE "ChangeProposal" DROP CONSTRAINT "ChangeProposal_songVersionId_fkey";

-- AlterTable
ALTER TABLE "ChangeProposal" ADD COLUMN     "reviewedAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "ChangeProposal" ADD CONSTRAINT "ChangeProposal_songVersionId_fkey" FOREIGN KEY ("songVersionId") REFERENCES "SongVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeProposal" ADD CONSTRAINT "ChangeProposal_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

