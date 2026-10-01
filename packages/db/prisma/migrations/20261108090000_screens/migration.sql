-- CreateEnum
CREATE TYPE "ScreenMode" AS ENUM ('LYRICS', 'CHART');

-- CreateTable
CREATE TABLE "Screen" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mode" "ScreenMode" NOT NULL DEFAULT 'LYRICS',
    "tokenHash" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "setlistId" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Screen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Screen_tokenHash_key" ON "Screen"("tokenHash");

-- CreateIndex
CREATE INDEX "Screen_ownerUserId_idx" ON "Screen"("ownerUserId");

-- CreateIndex
CREATE INDEX "Screen_setlistId_idx" ON "Screen"("setlistId");

-- AddForeignKey
ALTER TABLE "Screen" ADD CONSTRAINT "Screen_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Screen" ADD CONSTRAINT "Screen_setlistId_fkey" FOREIGN KEY ("setlistId") REFERENCES "Setlist"("id") ON DELETE SET NULL ON UPDATE CASCADE;

