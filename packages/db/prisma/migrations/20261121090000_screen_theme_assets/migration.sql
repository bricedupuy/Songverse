-- A screen theme's own files (issue #194): a background picture or video, or a font.
CREATE TABLE "ScreenThemeAsset" (
    "id" TEXT NOT NULL,
    "themeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScreenThemeAsset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ScreenThemeAsset_themeId_idx" ON "ScreenThemeAsset"("themeId");
CREATE INDEX "ScreenThemeAsset_storageKey_idx" ON "ScreenThemeAsset"("storageKey");

ALTER TABLE "ScreenThemeAsset" ADD CONSTRAINT "ScreenThemeAsset_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "ScreenTheme"("id") ON DELETE CASCADE ON UPDATE CASCADE;
