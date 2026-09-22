-- CreateTable
CREATE TABLE "SongbookCatalog" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "abbreviation" TEXT,
    "publisher" TEXT,
    "isbn" TEXT,
    "description" TEXT,
    "coverImageUrl" TEXT,
    "officialUrl" TEXT,
    "language" TEXT,
    "denomination" TEXT,
    "totalEntries" INTEGER,
    "licensed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SongbookCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SongbookCatalogEntry" (
    "id" TEXT NOT NULL,
    "catalogId" TEXT NOT NULL,
    "entryCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "originalLanguage" TEXT,
    "composer" TEXT,
    "author" TEXT,
    "ccli" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SongbookCatalogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SongbookCatalog_name_idx" ON "SongbookCatalog"("name");

-- CreateIndex
CREATE INDEX "SongbookCatalogEntry_catalogId_idx" ON "SongbookCatalogEntry"("catalogId");

-- CreateIndex
CREATE UNIQUE INDEX "SongbookCatalogEntry_catalogId_entryCode_key" ON "SongbookCatalogEntry"("catalogId", "entryCode");

-- AddForeignKey
ALTER TABLE "SongbookCatalogEntry" ADD CONSTRAINT "SongbookCatalogEntry_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "SongbookCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
