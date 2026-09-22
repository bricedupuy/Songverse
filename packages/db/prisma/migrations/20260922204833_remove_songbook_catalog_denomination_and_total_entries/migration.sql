-- Remove denomination/tradition and stated-total-entries from SongbookCatalog (not useful in practice).
ALTER TABLE "SongbookCatalog" DROP COLUMN "denomination";
ALTER TABLE "SongbookCatalog" DROP COLUMN "totalEntries";
