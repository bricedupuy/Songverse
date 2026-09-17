-- AlterTable
ALTER TABLE "Tag" ADD COLUMN     "translations" JSONB;

-- AlterTable
ALTER TABLE "TagCategory" ADD COLUMN     "translations" JSONB;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'en';
