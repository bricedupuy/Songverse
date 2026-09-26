-- Song images and artwork settings (issue #85).
-- AlterTable
ALTER TABLE "SongVersion" ADD COLUMN     "imageSourceUrl" TEXT,
ADD COLUMN     "imageStorageKey" TEXT;

-- CreateTable
CREATE TABLE "ArtworkSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "country" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArtworkSettings_pkey" PRIMARY KEY ("id")
);

