-- Nashville numbers and chord colours (issues #9, #207).
ALTER TYPE "ChordNotation" ADD VALUE 'NASHVILLE';

ALTER TABLE "User" ADD COLUMN "chordColors" BOOLEAN NOT NULL DEFAULT false;
