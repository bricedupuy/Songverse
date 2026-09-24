-- One song's arrangement for one set (issue #16): hidden from the song's
-- arrangements, gone with the set's song.
-- AlterTable
ALTER TABLE "Arrangement" ADD COLUMN     "setlistItemId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Arrangement_setlistItemId_key" ON "Arrangement"("setlistItemId");

-- AddForeignKey
ALTER TABLE "Arrangement" ADD CONSTRAINT "Arrangement_setlistItemId_fkey" FOREIGN KEY ("setlistItemId") REFERENCES "SetlistItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

