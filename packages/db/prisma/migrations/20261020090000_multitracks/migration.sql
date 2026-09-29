-- Multitracks (issue #123): audio files recorded together, grouped by an id; null is a song's original stems.
ALTER TABLE "Attachment" ADD COLUMN "recordingTimeSignature" TEXT;
ALTER TABLE "Attachment" ADD COLUMN "multitrackId" TEXT;
ALTER TABLE "Attachment" ADD COLUMN "multitrackName" TEXT;
