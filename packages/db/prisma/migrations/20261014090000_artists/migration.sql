-- Artist pictures and bios (issue #86).
-- AlterTable
ALTER TABLE "MetadataSettings" ADD COLUMN     "artistsEnabled" BOOLEAN;

-- CreateTable
CREATE TABLE "Artist" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imageStorageKey" TEXT,
    "imageSource" TEXT,
    "imageSourceUrl" TEXT,
    "musicbrainzId" TEXT,
    "wikidataId" TEXT,
    "lookedUpAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Artist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArtistBio" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "custom" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArtistBio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Artist_key_key" ON "Artist"("key");

-- CreateIndex
CREATE UNIQUE INDEX "ArtistBio_artistId_language_key" ON "ArtistBio"("artistId", "language");

-- AddForeignKey
ALTER TABLE "ArtistBio" ADD CONSTRAINT "ArtistBio_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
