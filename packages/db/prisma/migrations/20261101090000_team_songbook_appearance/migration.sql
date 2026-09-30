-- A picture and a colour for teams and songbooks (issue #161).
-- AlterTable
ALTER TABLE "Songbook" ADD COLUMN     "avatarStorageKey" TEXT,
ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "color" TEXT;

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "avatarStorageKey" TEXT,
ADD COLUMN     "color" TEXT;

