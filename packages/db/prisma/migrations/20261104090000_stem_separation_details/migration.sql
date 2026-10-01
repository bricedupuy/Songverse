-- CreateEnum
CREATE TYPE "AttachmentOrigin" AS ENUM ('UPLOADED', 'SEPARATED', 'RECORDED');

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "detected" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "origin" "AttachmentOrigin" NOT NULL DEFAULT 'UPLOADED';

-- AlterTable
ALTER TABLE "StemSeparation" ADD COLUMN     "fastModel" TEXT,
ADD COLUMN     "hqModel" TEXT,
ADD COLUMN     "replacesMultitrackId" TEXT,
ADD COLUMN     "sourceFilename" TEXT;

-- Existing files, worked out once (issue #175). Recorded in Songverse's
-- recorder: a take being processed, or one that was (an unlocked Opus file,
-- as the recorder makes; uploads are locked unless added to a multitrack).
UPDATE "Attachment" SET "origin" = 'RECORDED'
WHERE "type" = 'AUDIO' AND ("processing" IS NOT NULL OR ("mimeType" = 'audio/ogg' AND "locked" = false AND "filename" ILIKE '%.opus'));

-- Separated: the files of a separation's multitrack that weren't recorded into it.
UPDATE "Attachment" SET "origin" = 'SEPARATED'
WHERE "origin" = 'UPLOADED' AND "multitrackId" IN (SELECT "multitrackId" FROM "StemSeparation" WHERE "multitrackId" IS NOT NULL);

-- The models they were sent with, as the defaults were then (6 parts: htdemucs_6s).
UPDATE "StemSeparation" SET "fastModel" = CASE WHEN "parts" = '6' THEN 'htdemucs_6s' ELSE NULL END;
