-- Songbooks shared with people and teams (issue #211).
CREATE TABLE "SongbookShare" (
    "id" TEXT NOT NULL,
    "songbookId" TEXT NOT NULL,
    "userId" TEXT,
    "teamId" TEXT,
    "canEdit" BOOLEAN NOT NULL DEFAULT false,
    "sharedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SongbookShare_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SongbookShare_songbookId_userId_key" ON "SongbookShare"("songbookId", "userId");
CREATE UNIQUE INDEX "SongbookShare_songbookId_teamId_key" ON "SongbookShare"("songbookId", "teamId");
CREATE INDEX "SongbookShare_userId_idx" ON "SongbookShare"("userId");
CREATE INDEX "SongbookShare_teamId_idx" ON "SongbookShare"("teamId");
ALTER TABLE "SongbookShare" ADD CONSTRAINT "SongbookShare_songbookId_fkey" FOREIGN KEY ("songbookId") REFERENCES "Songbook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SongbookShare" ADD CONSTRAINT "SongbookShare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SongbookShare" ADD CONSTRAINT "SongbookShare_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SongbookShare" ADD CONSTRAINT "SongbookShare_sharedById_fkey" FOREIGN KEY ("sharedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
