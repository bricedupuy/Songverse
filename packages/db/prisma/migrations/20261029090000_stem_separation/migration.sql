-- Splitting recordings into stems with our Demucs API (issue #63).

-- CreateEnum
CREATE TYPE "StemSeparationStatus" AS ENUM ('QUEUED', 'SUBMITTED', 'FAST_READY', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "canSeparateStems" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "canSeparateStems" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "StemSeparationSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "apiUrl" TEXT,
    "apiKeyEnc" TEXT,
    "callbackSecretEnc" TEXT,
    "fastModel" TEXT,
    "hqModel" TEXT,
    "hqEnabled" BOOLEAN,
    "monthlyLimit" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StemSeparationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StemSeparation" (
    "id" TEXT NOT NULL,
    "songVersionId" TEXT NOT NULL,
    "sourceAttachmentId" TEXT NOT NULL,
    "requestedByUserId" TEXT,
    "parts" TEXT NOT NULL,
    "status" "StemSeparationStatus" NOT NULL DEFAULT 'QUEUED',
    "jobId" TEXT,
    "multitrackId" TEXT,
    "hqRequested" BOOLEAN NOT NULL DEFAULT false,
    "hqDone" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StemSeparation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StemSeparation_jobId_key" ON "StemSeparation"("jobId");

-- CreateIndex
CREATE INDEX "StemSeparation_songVersionId_idx" ON "StemSeparation"("songVersionId");

-- CreateIndex
CREATE INDEX "StemSeparation_requestedByUserId_createdAt_idx" ON "StemSeparation"("requestedByUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "StemSeparation" ADD CONSTRAINT "StemSeparation_songVersionId_fkey" FOREIGN KEY ("songVersionId") REFERENCES "SongVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StemSeparation" ADD CONSTRAINT "StemSeparation_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

