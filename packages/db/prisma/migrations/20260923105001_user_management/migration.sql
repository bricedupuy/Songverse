-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "uploadedByUserId" TEXT;

-- AlterTable
ALTER TABLE "StorageSettings" ADD COLUMN     "defaultUserStorageLimitMb" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarStorageKey" TEXT,
ADD COLUMN     "banReason" TEXT,
ADD COLUMN     "bannedAt" TIMESTAMP(3),
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "storageLimitMb" INTEGER;

-- CreateTable
CREATE TABLE "ContentTransfer" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "fromDisplayName" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContentTransfer_tokenHash_key" ON "ContentTransfer"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "ContentTransfer_fromUserId_key" ON "ContentTransfer"("fromUserId");

-- CreateIndex
CREATE INDEX "ContentTransfer_expiresAt_idx" ON "ContentTransfer"("expiresAt");

-- CreateIndex
CREATE INDEX "Attachment_uploadedByUserId_idx" ON "Attachment"("uploadedByUserId");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentTransfer" ADD CONSTRAINT "ContentTransfer_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: files uploaded before uploaders were tracked count against the
-- owner of the song they're attached to. Files on team-owned songs stay
-- unattributed (there's no record of which member uploaded them).
UPDATE "Attachment" AS a
SET "uploadedByUserId" = sv."ownerUserId"
FROM "SongVersion" AS sv
WHERE a."songVersionId" = sv."id"
  AND sv."ownerScope" = 'USER'
  AND sv."ownerUserId" IS NOT NULL;
