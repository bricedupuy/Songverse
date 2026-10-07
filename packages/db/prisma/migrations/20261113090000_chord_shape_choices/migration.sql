-- The player's own chord shapes (issue #207 phase 3): left-handed, tunings, and a shape per chord per song.
ALTER TABLE "User" ADD COLUMN "leftHanded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "guitarTuning" TEXT NOT NULL DEFAULT 'standard',
ADD COLUMN "ukuleleTuning" TEXT NOT NULL DEFAULT 'standard';

CREATE TABLE "ChordShapeChoice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "songVersionId" TEXT NOT NULL,
    "instrument" TEXT NOT NULL,
    "tuning" TEXT NOT NULL DEFAULT 'standard',
    "chord" TEXT NOT NULL,
    "frets" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChordShapeChoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChordShapeChoice_userId_songVersionId_instrument_tuning_chord_key" ON "ChordShapeChoice"("userId", "songVersionId", "instrument", "tuning", "chord");
CREATE INDEX "ChordShapeChoice_songVersionId_idx" ON "ChordShapeChoice"("songVersionId");

ALTER TABLE "ChordShapeChoice" ADD CONSTRAINT "ChordShapeChoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChordShapeChoice" ADD CONSTRAINT "ChordShapeChoice_songVersionId_fkey" FOREIGN KEY ("songVersionId") REFERENCES "SongVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
