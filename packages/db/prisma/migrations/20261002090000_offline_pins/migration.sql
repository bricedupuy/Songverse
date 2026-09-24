-- Offline pins (issue #52): sets, songs and songbooks a user keeps offline.
-- CreateEnum
CREATE TYPE "OfflinePinKind" AS ENUM ('SET', 'SONG', 'SONGBOOK');
-- CreateTable
CREATE TABLE "OfflinePin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "OfflinePinKind" NOT NULL,
    "targetId" TEXT NOT NULL,
    "includeAudio" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OfflinePin_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "OfflinePin_userId_kind_targetId_key" ON "OfflinePin"("userId", "kind", "targetId");
-- AddForeignKey
ALTER TABLE "OfflinePin" ADD CONSTRAINT "OfflinePin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
