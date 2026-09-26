-- The Apple Music API's MusicKit keys (issue #87).
-- AlterTable
ALTER TABLE "MetadataSettings" ALTER COLUMN "providers" DROP NOT NULL,
ADD COLUMN     "appleMusicKeyId" TEXT,
ADD COLUMN     "appleMusicPrivateKeyEnc" TEXT,
ADD COLUMN     "appleMusicTeamId" TEXT;
