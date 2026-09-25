-- CreateEnum
CREATE TYPE "SongRevisionKind" AS ENUM ('CREATED', 'EDITED', 'RESTORED', 'BASELINE');

-- CreateTable
CREATE TABLE "SongVersionRevision" (
    "id" TEXT NOT NULL,
    "songVersionId" TEXT NOT NULL,
    "kind" "SongRevisionKind" NOT NULL,
    "authorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "changes" TEXT[],
    "snapshot" JSONB NOT NULL,
    "restoredFromId" TEXT,

    CONSTRAINT "SongVersionRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SongVersionRevision_songVersionId_createdAt_idx" ON "SongVersionRevision"("songVersionId", "createdAt");

-- CreateIndex
CREATE INDEX "SongVersionRevision_authorUserId_idx" ON "SongVersionRevision"("authorUserId");

-- AddForeignKey
ALTER TABLE "SongVersionRevision" ADD CONSTRAINT "SongVersionRevision_songVersionId_fkey" FOREIGN KEY ("songVersionId") REFERENCES "SongVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongVersionRevision" ADD CONSTRAINT "SongVersionRevision_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongVersionRevision" ADD CONSTRAINT "SongVersionRevision_restoredFromId_fkey" FOREIGN KEY ("restoredFromId") REFERENCES "SongVersionRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;
