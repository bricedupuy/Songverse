-- Spotify, and MusicBrainz's contact, as metadata provider settings (issue #89).
-- AlterTable
ALTER TABLE "MetadataSettings" ADD COLUMN     "musicbrainzContact" TEXT,
ADD COLUMN     "spotifyClientId" TEXT,
ADD COLUMN     "spotifyClientSecretEnc" TEXT,
ADD COLUMN     "spotifyMarket" TEXT;
