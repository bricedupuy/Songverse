-- Metadata providers (issue #22).
-- AlterEnum
ALTER TYPE "SongIdentifierType" ADD VALUE 'DEEZER';
ALTER TYPE "SongIdentifierType" ADD VALUE 'METADATA_MATCH';

-- CreateTable
CREATE TABLE "MetadataSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "providers" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetadataSettings_pkey" PRIMARY KEY ("id")
);
