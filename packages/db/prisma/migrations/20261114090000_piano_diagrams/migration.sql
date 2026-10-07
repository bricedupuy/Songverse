-- Piano diagrams (issue #207 phase 4).
ALTER TYPE "ChordDiagrams" ADD VALUE 'PIANO';

ALTER TABLE "User" ADD COLUMN "pianoSmooth" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "pianoHands" TEXT NOT NULL DEFAULT 'both',
ADD COLUMN "pianoNoteNames" TEXT NOT NULL DEFAULT 'card';
