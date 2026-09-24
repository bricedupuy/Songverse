-- Arrangements (docs/arrangement-document-v2.md): stored as v2 (songRevision
-- replaces the frozen columns), gone with their song, a team's usual one per
-- song, players' own chart preferences, and letters-or-solfège chord names.

-- CreateEnum
CREATE TYPE "ChordNotation" AS ENUM ('LETTERS', 'SOLFEGE');

-- DropForeignKey
ALTER TABLE "Arrangement" DROP CONSTRAINT "Arrangement_songVersionId_fkey";

-- DropIndex
DROP INDEX "Arrangement_frozenAt_idx";

-- AlterTable
ALTER TABLE "Arrangement" DROP COLUMN "frozenAt",
DROP COLUMN "frozenReason",
ADD COLUMN     "isTeamDefault" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "chordNotation" "ChordNotation" NOT NULL DEFAULT 'LETTERS';

-- CreateTable
CREATE TABLE "ChartPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "songVersionId" TEXT NOT NULL,
    "arrangementId" TEXT,
    "arrangementKey" TEXT NOT NULL DEFAULT '',
    "preferencesJson" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChartPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChartPreference_songVersionId_idx" ON "ChartPreference"("songVersionId");

-- CreateIndex
CREATE INDEX "ChartPreference_arrangementId_idx" ON "ChartPreference"("arrangementId");

-- CreateIndex
CREATE UNIQUE INDEX "ChartPreference_userId_songVersionId_arrangementKey_key" ON "ChartPreference"("userId", "songVersionId", "arrangementKey");

-- AddForeignKey
ALTER TABLE "Arrangement" ADD CONSTRAINT "Arrangement_songVersionId_fkey" FOREIGN KEY ("songVersionId") REFERENCES "SongVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartPreference" ADD CONSTRAINT "ChartPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartPreference" ADD CONSTRAINT "ChartPreference_songVersionId_fkey" FOREIGN KEY ("songVersionId") REFERENCES "SongVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartPreference" ADD CONSTRAINT "ChartPreference_arrangementId_fkey" FOREIGN KEY ("arrangementId") REFERENCES "Arrangement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

