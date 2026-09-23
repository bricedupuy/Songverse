/*
  Warnings:

  - You are about to drop the column `keyOverride` on the `SetlistItem` table. All the data in the column will be lost.
  - Made the column `songVersionId` on table `SetlistItem` required. This step will fail if there are existing NULL values in that column.

*/
-- Defensive: nothing created sets before this migration, but make sure no
-- row can block the NOT NULL / foreign-key changes below.
DELETE FROM "SetlistItem" WHERE "songVersionId" IS NULL;
DELETE FROM "Setlist" s
WHERE (s."ownerUserId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u."id" = s."ownerUserId"))
   OR (s."ownerTeamId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Team" t WHERE t."id" = s."ownerTeamId"));

-- DropForeignKey
ALTER TABLE "SetlistItem" DROP CONSTRAINT "SetlistItem_songVersionId_fkey";

-- AlterTable
ALTER TABLE "Setlist" ALTER COLUMN "name" DROP NOT NULL,
ALTER COLUMN "eventDate" SET DATA TYPE DATE;

-- AlterTable
ALTER TABLE "SetlistItem" DROP COLUMN "keyOverride",
ADD COLUMN     "transposeSteps" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "songVersionId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Setlist" ADD CONSTRAINT "Setlist_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Setlist" ADD CONSTRAINT "Setlist_ownerTeamId_fkey" FOREIGN KEY ("ownerTeamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetlistItem" ADD CONSTRAINT "SetlistItem_songVersionId_fkey" FOREIGN KEY ("songVersionId") REFERENCES "SongVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
