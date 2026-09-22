-- CreateEnum
CREATE TYPE "SongbookKind" AS ENUM ('SIMPLE', 'NUMBERED');

-- AlterTable
ALTER TABLE "Songbook" ADD COLUMN     "kind" "SongbookKind" NOT NULL DEFAULT 'NUMBERED',
ADD COLUMN     "sections" JSONB;

-- AlterTable
ALTER TABLE "SongbookEntry" ALTER COLUMN "entryCode" DROP NOT NULL;

-- DropIndex
DROP INDEX "SongbookEntry_songbookId_entryCode_idx";

-- CreateIndex
CREATE UNIQUE INDEX "SongbookEntry_songbookId_entryCode_key" ON "SongbookEntry"("songbookId", "entryCode");
