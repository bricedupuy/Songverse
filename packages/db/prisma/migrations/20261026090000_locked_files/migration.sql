-- A file kept as uploaded (issue #145): not deleted, replaced, merged or cleaned up until its uploader unlocks it.
ALTER TABLE "Attachment" ADD COLUMN "locked" BOOLEAN NOT NULL DEFAULT false;

-- The song's own audio uploaded so far (its original stems, not a
-- multitrack's), locked. Recordings (made in Songverse, kept as Opus by the
-- Worker) stay unlocked, as new ones are.
UPDATE "Attachment" SET "locked" = true
WHERE "type" = 'AUDIO' AND "multitrackId" IS NULL AND "mimeType" <> 'audio/ogg';
