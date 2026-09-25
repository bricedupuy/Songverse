-- A catalogue's printed volumes (issue #55): number ranges, as a songbook's
-- sections, copied into songbooks imported from it.
ALTER TABLE "SongbookCatalog" ADD COLUMN "sections" JSONB;
