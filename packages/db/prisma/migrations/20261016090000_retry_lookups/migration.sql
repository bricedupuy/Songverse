-- Lookups that may have failed rather than found nothing (issue #93): tried
-- again once. Until now a song whose artwork lookup failed was marked as
-- having none to find, and an artist whose lookup failed as looked up (with
-- no picture); from now on only an answered lookup marks them.
UPDATE "SongVersion" SET "imageSourceUrl" = NULL WHERE "imageSourceUrl" = 'none' AND "imageStorageKey" IS NULL;
UPDATE "Artist" SET "lookedUpAt" = NULL, "imageSource" = NULL
WHERE "imageSource" = 'none' AND "imageStorageKey" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "ArtistBio" b WHERE b."artistId" = "Artist"."id");
