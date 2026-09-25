-- AlterTable
ALTER TABLE "SongVersion" ADD COLUMN     "contributedByTeamId" TEXT,
ADD COLUMN     "contributedByUserId" TEXT;

-- AddForeignKey
ALTER TABLE "SongVersion" ADD CONSTRAINT "SongVersion_contributedByUserId_fkey" FOREIGN KEY ("contributedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongVersion" ADD CONSTRAINT "SongVersion_contributedByTeamId_fkey" FOREIGN KEY ("contributedByTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Songs published before, as copies: credited to who submitted them.
UPDATE "SongVersion" AS sv
SET "contributedByUserId" = s."submitterId"
FROM "Submission" AS s
WHERE s."publishedVersionId" = sv."id" AND s."state" = 'APPROVED' AND s."mergeTargetId" IS NULL AND sv."contributedByUserId" IS NULL;

