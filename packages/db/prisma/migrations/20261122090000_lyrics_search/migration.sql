-- Finding a song by its words (issue #221): its sung lines, folded for
-- search, kept by the API with each save; the Worker fills older songs.
ALTER TABLE "SongVersion" ADD COLUMN "lyricsText" TEXT;

-- CreateIndex
CREATE INDEX "SongVersion_lyricsText_idx" ON "SongVersion" USING GIN ("lyricsText" gin_trgm_ops);
