-- Search ignoring accents (issue #56): "elevation" finds "Élévation", as it
-- already found "ÉLÉVATION". The song's searchText and a credit's
-- sourceSearch are kept without accents (unaccent), and the API strips the
-- query's the same way before matching; the trigram indexes still serve it.
--
-- unaccent ships with Postgres, like pg_trgm. If this database lacks it,
-- this fails here, saying which extension is missing.
CREATE EXTENSION IF NOT EXISTS unaccent;

-- A song's search text, as before (titles, version name, performers), without accents.
CREATE OR REPLACE FUNCTION song_version_search_text(song_id TEXT, title TEXT, alternate_title TEXT, version_name TEXT) RETURNS TEXT
LANGUAGE sql STABLE AS $$
  SELECT unaccent(concat_ws(' ', title, alternate_title, version_name,
    (SELECT string_agg(vc.source, ' ' ORDER BY vc."displayOrder", vc.id)
       FROM "VersionContributor" vc
      WHERE vc."songVersionId" = song_id
        AND vc.roles @> ARRAY['PERFORMER']::"ContributorRole"[]
        AND vc.source IS NOT NULL)))
$$;

UPDATE "SongVersion" sv SET "searchText" = song_version_search_text(sv.id, sv.title, sv."alternateTitle", sv."versionName");

-- A credit's name without accents, for the credit autocomplete.
ALTER TABLE "VersionContributor" ADD COLUMN "sourceSearch" TEXT;

CREATE FUNCTION version_contributor_source_search() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW."sourceSearch" := unaccent(NEW.source);
  RETURN NEW;
END $$;

CREATE TRIGGER version_contributor_source_search
BEFORE INSERT OR UPDATE OF source ON "VersionContributor"
FOR EACH ROW EXECUTE FUNCTION version_contributor_source_search();

UPDATE "VersionContributor" SET "sourceSearch" = unaccent(source);

-- CreateIndex
CREATE INDEX "VersionContributor_sourceSearch_idx" ON "VersionContributor" USING GIN ("sourceSearch" gin_trgm_ops);
