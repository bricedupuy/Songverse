-- Songs' chord progressions, for finding songs by progression (issue #204).
CREATE TABLE "SongProgression" (
    "songVersionId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "sections" JSONB NOT NULL,
    "grams" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SongProgression_pkey" PRIMARY KEY ("songVersionId")
);

CREATE INDEX "SongProgression_grams_idx" ON "SongProgression" USING GIN ("grams");

ALTER TABLE "SongProgression" ADD CONSTRAINT "SongProgression_songVersionId_fkey" FOREIGN KEY ("songVersionId") REFERENCES "SongVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
