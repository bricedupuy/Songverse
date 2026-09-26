-- Favorites and song views, for the Library's home (issue #81).
-- CreateTable
CREATE TABLE "FavoriteSong" (
    "userId" TEXT NOT NULL,
    "songVersionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FavoriteSong_pkey" PRIMARY KEY ("userId","songVersionId")
);

-- CreateTable
CREATE TABLE "SongView" (
    "userId" TEXT NOT NULL,
    "songVersionId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "count" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "SongView_pkey" PRIMARY KEY ("userId","songVersionId")
);

-- CreateIndex
CREATE INDEX "FavoriteSong_songVersionId_idx" ON "FavoriteSong"("songVersionId");

-- CreateIndex
CREATE INDEX "SongView_userId_viewedAt_idx" ON "SongView"("userId", "viewedAt");

-- CreateIndex
CREATE INDEX "SongView_songVersionId_viewedAt_idx" ON "SongView"("songVersionId", "viewedAt");

-- AddForeignKey
ALTER TABLE "FavoriteSong" ADD CONSTRAINT "FavoriteSong_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavoriteSong" ADD CONSTRAINT "FavoriteSong_songVersionId_fkey" FOREIGN KEY ("songVersionId") REFERENCES "SongVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongView" ADD CONSTRAINT "SongView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongView" ADD CONSTRAINT "SongView_songVersionId_fkey" FOREIGN KEY ("songVersionId") REFERENCES "SongVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

