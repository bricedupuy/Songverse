-- A developer token address for the Apple Music API, until there is a MusicKit key (issue #87).
-- AlterTable
ALTER TABLE "MetadataSettings" ADD COLUMN     "appleMusicTokenUrl" TEXT;
