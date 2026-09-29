-- Recordings, step 2 (issue #127): takes processed by the Worker, other takes of a part, multitracks for a set.
CREATE TYPE "TakeProcessing" AS ENUM ('PENDING', 'FAILED');

ALTER TABLE "Attachment" ADD COLUMN "multitrackSetlistId" TEXT;
ALTER TABLE "Attachment" ADD COLUMN "otherTake" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Attachment" ADD COLUMN "processing" "TakeProcessing";

ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_multitrackSetlistId_fkey" FOREIGN KEY ("multitrackSetlistId") REFERENCES "Setlist"("id") ON DELETE SET NULL ON UPDATE CASCADE;
