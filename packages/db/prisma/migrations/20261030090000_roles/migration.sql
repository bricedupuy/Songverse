-- Roles (issue #160): what someone may do - review, split recordings into
-- stems, how much they may store - given to users and to teams, in place of
-- User.isReviewer, User/Team.canSeparateStems and User.storageLimitMb.

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "builtIn" TEXT,
    "canReview" BOOLEAN NOT NULL DEFAULT false,
    "canSeparateStems" BOOLEAN NOT NULL DEFAULT false,
    "stemSeparationMonthlyLimit" INTEGER,
    "storageLimitMb" INTEGER,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleAssignment" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "userId" TEXT,
    "teamId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoleAssignment_pkey" PRIMARY KEY ("id"),
    -- Given to a user or to a team, never both.
    CONSTRAINT "RoleAssignment_one_holder" CHECK (("userId" IS NULL) <> ("teamId" IS NULL))
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");
CREATE UNIQUE INDEX "Role_builtIn_key" ON "Role"("builtIn");
CREATE INDEX "RoleAssignment_userId_idx" ON "RoleAssignment"("userId");
CREATE INDEX "RoleAssignment_teamId_idx" ON "RoleAssignment"("teamId");
CREATE UNIQUE INDEX "RoleAssignment_roleId_userId_key" ON "RoleAssignment"("roleId", "userId");
CREATE UNIQUE INDEX "RoleAssignment_roleId_teamId_key" ON "RoleAssignment"("roleId", "teamId");

-- AddForeignKey
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: a team's storage pool has its own default.
ALTER TABLE "StorageSettings" ADD COLUMN "defaultTeamStorageLimitMb" INTEGER;

-- The two built-in roles.
INSERT INTO "Role" ("id", "name", "description", "builtIn", "canReview", "updatedAt")
VALUES ('role_reviewer', 'Reviewer', 'Reviews songs submitted to the global catalogue.', 'REVIEWER', true, CURRENT_TIMESTAMP);
INSERT INTO "Role" ("id", "name", "description", "builtIn", "canSeparateStems", "updatedAt")
VALUES ('role_stem_separation', 'Stem separation', 'Splits recordings into stems.', 'STEM_SEPARATION', true, CURRENT_TIMESTAMP);

-- Who had them.
INSERT INTO "RoleAssignment" ("id", "roleId", "userId")
SELECT 'ra_' || md5('reviewer' || "id"), 'role_reviewer', "id" FROM "User" WHERE "isReviewer";
INSERT INTO "RoleAssignment" ("id", "roleId", "userId")
SELECT 'ra_' || md5('stems' || "id"), 'role_stem_separation', "id" FROM "User" WHERE "canSeparateStems";
INSERT INTO "RoleAssignment" ("id", "roleId", "teamId")
SELECT 'ra_' || md5('stems' || "id"), 'role_stem_separation', "id" FROM "Team" WHERE "canSeparateStems";

-- Each storage limit a user had becomes a tier.
INSERT INTO "Role" ("id", "name", "description", "storageLimitMb", "updatedAt")
SELECT DISTINCT 'role_storage_' || "storageLimitMb",
  'Storage ' || CASE WHEN "storageLimitMb" > 0 AND "storageLimitMb" % 1024 = 0 THEN ("storageLimitMb" / 1024) || ' GB' ELSE "storageLimitMb" || ' MB' END,
  'A storage tier.', "storageLimitMb", CURRENT_TIMESTAMP
FROM "User" WHERE "storageLimitMb" IS NOT NULL;
INSERT INTO "RoleAssignment" ("id", "roleId", "userId")
SELECT 'ra_' || md5('storage' || "id"), 'role_storage_' || "storageLimitMb", "id" FROM "User" WHERE "storageLimitMb" IS NOT NULL;

-- AlterTable
ALTER TABLE "Team" DROP COLUMN "canSeparateStems";
ALTER TABLE "User" DROP COLUMN "canSeparateStems",
DROP COLUMN "isReviewer",
DROP COLUMN "storageLimitMb";
