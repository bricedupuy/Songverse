-- Screen themes (issue #194).
-- AlterTable
ALTER TABLE "Screen" ADD COLUMN     "themeId" TEXT,
ADD COLUMN     "themeTemplate" TEXT;

-- CreateTable
CREATE TABLE "ScreenTheme" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "document" JSONB NOT NULL,
    "ownerUserId" TEXT,
    "ownerTeamId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScreenTheme_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScreenTheme_ownerUserId_idx" ON "ScreenTheme"("ownerUserId");

-- CreateIndex
CREATE INDEX "ScreenTheme_ownerTeamId_idx" ON "ScreenTheme"("ownerTeamId");

-- CreateIndex
CREATE INDEX "Screen_themeId_idx" ON "Screen"("themeId");

-- AddForeignKey
ALTER TABLE "Screen" ADD CONSTRAINT "Screen_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "ScreenTheme"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScreenTheme" ADD CONSTRAINT "ScreenTheme_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScreenTheme" ADD CONSTRAINT "ScreenTheme_ownerTeamId_fkey" FOREIGN KEY ("ownerTeamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
