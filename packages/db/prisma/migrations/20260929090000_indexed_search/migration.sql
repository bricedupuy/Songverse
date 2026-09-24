-- Indexed search (audit item 12). Library search and credit autocomplete
-- match "contains, ignoring case" (ILIKE '%q%'), which a b-tree index can't
-- serve; trigram indexes (pg_trgm, shipped with Postgres) can.
--
-- Library search matches the title, subtitle, version name and performers.
-- The performers live in VersionContributor, and an OR across a join keeps
-- Postgres from using any index - so the song gets one "searchText" column
-- holding all of them, maintained here by triggers (whatever code writes a
-- song or its credits) and served by one trigram index. On 200,000 songs a
-- search went from about 600 ms to 1-40 ms.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- AlterTable
ALTER TABLE "SongVersion" ADD COLUMN     "searchText" TEXT NOT NULL DEFAULT '';

-- A song's search text: its titles and version name, then its performers in credit order.
CREATE FUNCTION song_version_search_text(song_id TEXT, title TEXT, alternate_title TEXT, version_name TEXT) RETURNS TEXT
LANGUAGE sql STABLE AS $$
  SELECT concat_ws(' ', title, alternate_title, version_name,
    (SELECT string_agg(vc.source, ' ' ORDER BY vc."displayOrder", vc.id)
       FROM "VersionContributor" vc
      WHERE vc."songVersionId" = song_id
        AND vc.roles @> ARRAY['PERFORMER']::"ContributorRole"[]
        AND vc.source IS NOT NULL))
$$;

CREATE FUNCTION song_version_search_text_on_song() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW."searchText" := song_version_search_text(NEW.id, NEW.title, NEW."alternateTitle", NEW."versionName");
  RETURN NEW;
END $$;

CREATE TRIGGER song_version_search_text
BEFORE INSERT OR UPDATE OF title, "alternateTitle", "versionName" ON "SongVersion"
FOR EACH ROW EXECUTE FUNCTION song_version_search_text_on_song();

-- A credit added, changed or removed: its song's (or songs') search text again.
CREATE FUNCTION song_version_search_text_on_credit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    UPDATE "SongVersion" sv
       SET "searchText" = song_version_search_text(sv.id, sv.title, sv."alternateTitle", sv."versionName")
     WHERE sv.id = OLD."songVersionId";
  END IF;
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW."songVersionId" IS DISTINCT FROM OLD."songVersionId") THEN
    UPDATE "SongVersion" sv
       SET "searchText" = song_version_search_text(sv.id, sv.title, sv."alternateTitle", sv."versionName")
     WHERE sv.id = NEW."songVersionId";
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER version_contributor_search_text
AFTER INSERT OR UPDATE OF source, roles, "songVersionId", "displayOrder" OR DELETE ON "VersionContributor"
FOR EACH ROW EXECUTE FUNCTION song_version_search_text_on_credit();

-- The songs already there.
UPDATE "SongVersion" sv SET "searchText" = song_version_search_text(sv.id, sv.title, sv."alternateTitle", sv."versionName");

-- CreateIndex
CREATE INDEX "SongVersion_searchText_idx" ON "SongVersion" USING GIN ("searchText" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "SongVersion_title_idx" ON "SongVersion" USING GIN ("title" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "SongVersion_alternateTitle_idx" ON "SongVersion" USING GIN ("alternateTitle" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "VersionContributor_source_idx" ON "VersionContributor" USING GIN ("source" gin_trgm_ops);
