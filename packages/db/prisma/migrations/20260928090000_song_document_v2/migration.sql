-- SongDocument v2 (docs/song-document-v2.md). Documents themselves are
-- upgraded by the API (on read and at startup): the conversion is code.

-- The capo leaves the song document; it's kept on the row until
-- arrangements exist.
ALTER TABLE "SongVersion" ADD COLUMN "capo" INTEGER;

UPDATE "SongVersion"
SET "capo" = ("documentJson" -> 'defaults' ->> 'capo')::INTEGER
WHERE jsonb_typeof("documentJson" -> 'defaults' -> 'capo') = 'number'
  AND ("documentJson" -> 'defaults' ->> 'capo')::INTEGER > 0;

-- ChordPro exports are built on demand from the columns and the document.
ALTER TABLE "SongVersion" DROP COLUMN "chordproCache",
DROP COLUMN "chordproCacheAt";
