-- AlterTable
ALTER TABLE "User" ADD COLUMN     "instruments" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "techRoles" TEXT[] DEFAULT ARRAY[]::TEXT[];
