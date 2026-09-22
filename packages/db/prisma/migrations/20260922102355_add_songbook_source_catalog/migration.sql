-- AlterTable
ALTER TABLE "Songbook" ADD COLUMN     "sourceCatalogId" TEXT;

-- AddForeignKey
ALTER TABLE "Songbook" ADD CONSTRAINT "Songbook_sourceCatalogId_fkey" FOREIGN KEY ("sourceCatalogId") REFERENCES "SongbookCatalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;
