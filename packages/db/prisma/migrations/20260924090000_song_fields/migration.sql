-- AlterTable
ALTER TABLE "SongVersion" ADD COLUMN     "album" TEXT,
ADD COLUMN     "isrc" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "reference" TEXT,
ADD COLUMN     "sortTitle" TEXT,
ADD COLUMN     "year" INTEGER;

-- AlterTable
ALTER TABLE "SongbookCatalogEntry" ADD COLUMN     "durationSeconds" INTEGER,
ADD COLUMN     "isrc" TEXT;

