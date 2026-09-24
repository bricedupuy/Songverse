-- DropForeignKey
ALTER TABLE "Submission" DROP CONSTRAINT "Submission_songVersionId_fkey";

-- DropForeignKey
ALTER TABLE "UpstreamLink" DROP CONSTRAINT "UpstreamLink_globalVersionId_fkey";

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "publishedVersionId" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isReviewer" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_songVersionId_fkey" FOREIGN KEY ("songVersionId") REFERENCES "SongVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_publishedVersionId_fkey" FOREIGN KEY ("publishedVersionId") REFERENCES "SongVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UpstreamLink" ADD CONSTRAINT "UpstreamLink_globalVersionId_fkey" FOREIGN KEY ("globalVersionId") REFERENCES "SongVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

