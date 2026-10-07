-- Chord diagrams beside a chart (issue #207): off unless chosen.
CREATE TYPE "ChordDiagrams" AS ENUM ('OFF', 'GUITAR', 'UKULELE');

ALTER TABLE "User" ADD COLUMN "chordDiagrams" "ChordDiagrams" NOT NULL DEFAULT 'OFF';
