-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "originalMimeType" TEXT,
ADD COLUMN     "originalSizeBytes" INTEGER,
ADD COLUMN     "originalStorageKey" TEXT;

-- AlterTable
ALTER TABLE "Role" ADD COLUMN     "canKeepLosslessAudio" BOOLEAN NOT NULL DEFAULT false;

