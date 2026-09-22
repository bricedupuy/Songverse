-- AlterTable
ALTER TABLE "Songbook" ADD COLUMN     "ownerScope" "OwnershipScope" NOT NULL DEFAULT 'GLOBAL',
ADD COLUMN     "ownerTeamId" TEXT,
ADD COLUMN     "ownerUserId" TEXT;

-- CreateIndex
CREATE INDEX "Songbook_ownerUserId_idx" ON "Songbook"("ownerUserId");

-- CreateIndex
CREATE INDEX "Songbook_ownerTeamId_idx" ON "Songbook"("ownerTeamId");

-- CreateIndex
CREATE INDEX "Songbook_ownerScope_idx" ON "Songbook"("ownerScope");

-- AddForeignKey
ALTER TABLE "Songbook" ADD CONSTRAINT "Songbook_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Songbook" ADD CONSTRAINT "Songbook_ownerTeamId_fkey" FOREIGN KEY ("ownerTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
