-- CreateEnum
CREATE TYPE "OwnershipRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- AlterTable
ALTER TABLE "SetlistItem" ADD COLUMN     "sharedByUserId" TEXT;

-- CreateTable
CREATE TABLE "SetlistShareLink" (
    "id" TEXT NOT NULL,
    "setlistId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SetlistShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SetlistGuest" (
    "id" TEXT NOT NULL,
    "setlistId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SetlistGuest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SongOwnershipRequest" (
    "id" TEXT NOT NULL,
    "songVersionId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "setlistId" TEXT,
    "requestedByUserId" TEXT,
    "status" "OwnershipRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "SongOwnershipRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SetlistShareLink_setlistId_key" ON "SetlistShareLink"("setlistId");

-- CreateIndex
CREATE UNIQUE INDEX "SetlistShareLink_token_key" ON "SetlistShareLink"("token");

-- CreateIndex
CREATE INDEX "SetlistGuest_userId_idx" ON "SetlistGuest"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SetlistGuest_setlistId_userId_key" ON "SetlistGuest"("setlistId", "userId");

-- CreateIndex
CREATE INDEX "SongOwnershipRequest_songVersionId_status_idx" ON "SongOwnershipRequest"("songVersionId", "status");

-- CreateIndex
CREATE INDEX "SongOwnershipRequest_teamId_idx" ON "SongOwnershipRequest"("teamId");

-- AddForeignKey
ALTER TABLE "SetlistShareLink" ADD CONSTRAINT "SetlistShareLink_setlistId_fkey" FOREIGN KEY ("setlistId") REFERENCES "Setlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetlistGuest" ADD CONSTRAINT "SetlistGuest_setlistId_fkey" FOREIGN KEY ("setlistId") REFERENCES "Setlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetlistGuest" ADD CONSTRAINT "SetlistGuest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongOwnershipRequest" ADD CONSTRAINT "SongOwnershipRequest_songVersionId_fkey" FOREIGN KEY ("songVersionId") REFERENCES "SongVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongOwnershipRequest" ADD CONSTRAINT "SongOwnershipRequest_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongOwnershipRequest" ADD CONSTRAINT "SongOwnershipRequest_setlistId_fkey" FOREIGN KEY ("setlistId") REFERENCES "Setlist"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongOwnershipRequest" ADD CONSTRAINT "SongOwnershipRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetlistItem" ADD CONSTRAINT "SetlistItem_sharedByUserId_fkey" FOREIGN KEY ("sharedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
