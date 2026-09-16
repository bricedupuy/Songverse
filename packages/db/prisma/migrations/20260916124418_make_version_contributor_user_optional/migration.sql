-- DropForeignKey
ALTER TABLE "VersionContributor" DROP CONSTRAINT "VersionContributor_userId_fkey";

-- AlterTable
ALTER TABLE "VersionContributor" ALTER COLUMN "userId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "VersionContributor" ADD CONSTRAINT "VersionContributor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
