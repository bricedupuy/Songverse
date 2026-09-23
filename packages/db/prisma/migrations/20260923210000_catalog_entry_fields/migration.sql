-- "author" becomes "lyricist" (same data; catalogue files still accept "Author").
ALTER TABLE "SongbookCatalogEntry" RENAME COLUMN "author" TO "lyricist";

-- AlterTable
ALTER TABLE "SongbookCatalogEntry" ADD COLUMN     "album" TEXT,
ADD COLUMN     "artist" TEXT,
ADD COLUMN     "copyright" TEXT,
ADD COLUMN     "key" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "originalSong" TEXT,
ADD COLUMN     "reference" TEXT,
ADD COLUMN     "sortTitle" TEXT,
ADD COLUMN     "subtitle" TEXT,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "tempo" INTEGER,
ADD COLUMN     "timeSignature" TEXT,
ADD COLUMN     "year" INTEGER;
