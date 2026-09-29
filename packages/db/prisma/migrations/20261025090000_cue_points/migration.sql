-- Where each section starts in a recording (issue #110), the same on each file of a multitrack.
ALTER TABLE "Attachment" ADD COLUMN "cuePoints" JSONB;
