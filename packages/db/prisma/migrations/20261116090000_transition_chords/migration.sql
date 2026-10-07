-- Chords played into the next song of a set (issue #10), as degrees of its key.
ALTER TABLE "SetlistItem" ADD COLUMN "transitionChords" TEXT[] DEFAULT ARRAY[]::TEXT[];
