import { createFileRoute, Link, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "#/lib/api-client";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";

export const Route = createFileRoute("/_protected/songbooks/$songbookId")({
  loader: async ({ context, params }) => {
    const [songbook, songVersions] = await Promise.all([
      apiClient.getSongbook(params.songbookId).catch(() => null),
      apiClient.listSongVersions(),
    ]);
    if (!songbook) throw redirect({ to: "/songbooks" });
    return { session: context.session, teams: context.teams, songbook, songVersions };
  },
  component: SongbookDetail,
});

function SongbookDetail() {
  const { t } = useTranslation();
  const router = useRouter();
  const navigate = useNavigate();
  const { session, teams, songbook, songVersions } = Route.useLoaderData();

  const canEdit =
    session.isGlobalAdmin ||
    (songbook.ownerScope === "USER"
      ? songbook.ownerUserId === session.userId
      : songbook.ownerScope === "TEAM"
        ? teams.some((team) => team.id === songbook.ownerTeamId && team.currentUserRole === "ADMIN")
        : false);

  const [name, setName] = useState(songbook.name);
  const [abbreviation, setAbbreviation] = useState(songbook.abbreviation ?? "");
  const [language, setLanguage] = useState(songbook.language ?? "");
  const [publisher, setPublisher] = useState(songbook.publisher ?? "");
  const [year, setYear] = useState(songbook.year?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const [entryFilter, setEntryFilter] = useState("");
  const [selectedSongVersionId, setSelectedSongVersionId] = useState("");
  const [entryCode, setEntryCode] = useState("");
  const [addingEntry, setAddingEntry] = useState(false);
  const [entryError, setEntryError] = useState<string | null>(null);

  const filteredSongVersions = useMemo(() => {
    const alreadyAdded = new Set(songbook.entries.map((entry) => entry.songVersionId));
    const query = entryFilter.trim().toLowerCase();
    return songVersions
      .filter((version) => !alreadyAdded.has(version.id))
      .filter((version) => !query || version.title.toLowerCase().includes(query))
      .slice(0, 20);
  }, [songVersions, songbook.entries, entryFilter]);

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      await apiClient.updateSongbook(songbook.id, {
        name,
        abbreviation: abbreviation.trim() || undefined,
        language: language.trim() || undefined,
        publisher: publisher.trim() || undefined,
        year: year.trim() ? Number(year) : undefined,
      });
      await router.invalidate();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setDeleting(true);
    try {
      await apiClient.deleteSongbook(songbook.id);
      await navigate({ to: "/songbooks" });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  async function addEntry() {
    if (!selectedSongVersionId || !entryCode.trim()) return;
    setAddingEntry(true);
    setEntryError(null);
    try {
      await apiClient.addSongbookEntry(songbook.id, selectedSongVersionId, entryCode.trim());
      setSelectedSongVersionId("");
      setEntryCode("");
      setEntryFilter("");
      await router.invalidate();
    } catch (err) {
      setEntryError(err instanceof Error ? err.message : String(err));
    } finally {
      setAddingEntry(false);
    }
  }

  async function removeEntry(entryId: string) {
    try {
      await apiClient.removeSongbookEntry(songbook.id, entryId);
      await router.invalidate();
    } catch (err) {
      setEntryError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{songbook.name}</h1>
        <p className="text-sm text-muted-foreground">
          {songbook.ownerScope === "GLOBAL"
            ? t("songbooks.global")
            : songbook.ownerScope === "TEAM"
              ? t("songbooks.teamOwned")
              : t("songbooks.personal")}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("songbooks.details")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="songbook-name">{t("songbooks.name")}</Label>
            <Input id="songbook-name" value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="songbook-abbreviation">{t("songbooks.abbreviation")}</Label>
            <Input
              id="songbook-abbreviation"
              value={abbreviation}
              onChange={(e) => setAbbreviation(e.target.value)}
              disabled={!canEdit}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="songbook-language">{t("songbooks.language")}</Label>
            <Input
              id="songbook-language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              disabled={!canEdit}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="songbook-publisher">{t("songbooks.publisher")}</Label>
            <Input
              id="songbook-publisher"
              value={publisher}
              onChange={(e) => setPublisher(e.target.value)}
              disabled={!canEdit}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="songbook-year">{t("songbooks.year")}</Label>
            <Input
              id="songbook-year"
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              disabled={!canEdit}
            />
          </div>
          {saveError ? <p className="text-sm text-destructive">{saveError}</p> : null}
          {canEdit ? (
            <div className="flex items-center justify-between">
              <Button onClick={() => void save()} disabled={saving || !name.trim()}>
                {saving ? t("songbooks.saving") : t("songbooks.save")}
              </Button>
              {confirmingDelete ? (
                <div className="flex items-center gap-2">
                  <Button variant="destructive" size="sm" onClick={() => void remove()} disabled={deleting}>
                    {deleting ? t("songbooks.deleting") : t("songbooks.confirmDelete")}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
                    {t("songbooks.cancel")}
                  </Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setConfirmingDelete(true)}>
                  {t("songbooks.deleteSongbook")}
                </Button>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("songbooks.entries")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {songbook.entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("songbooks.noEntriesYet")}</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {songbook.entries.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-3">
                    <span className="w-14 shrink-0 rounded-md bg-muted px-2 py-1 text-center text-xs font-medium">
                      {entry.entryCode}
                    </span>
                    <Link
                      to="/library/$songVersionId"
                      params={{ songVersionId: entry.songVersionId }}
                      className="text-sm hover:text-primary"
                    >
                      {entry.songVersionTitle ?? entry.songVersionId}
                    </Link>
                  </div>
                  {canEdit ? (
                    <Button variant="ghost" size="sm" onClick={() => void removeEntry(entry.id)}>
                      {t("songbooks.remove")}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {canEdit ? (
            <div className="flex flex-col gap-2 border-t pt-4">
              <Label htmlFor="entry-search">{t("songbooks.addEntry")}</Label>
              <div className="flex flex-wrap gap-2">
                <Input
                  id="entry-search"
                  value={entryFilter}
                  onChange={(e) => {
                    setEntryFilter(e.target.value);
                    setSelectedSongVersionId("");
                  }}
                  placeholder={t("songbooks.searchSongPlaceholder")}
                  className="max-w-xs"
                />
                <Input
                  value={entryCode}
                  onChange={(e) => setEntryCode(e.target.value)}
                  placeholder={t("songbooks.entryCodePlaceholder")}
                  className="w-28"
                />
                <Button
                  onClick={() => void addEntry()}
                  disabled={addingEntry || !selectedSongVersionId || !entryCode.trim()}
                >
                  {addingEntry ? t("songbooks.adding") : t("songbooks.add")}
                </Button>
              </div>
              {entryFilter && !selectedSongVersionId ? (
                filteredSongVersions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("songbooks.noMatchingSongs")}</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {filteredSongVersions.map((version) => (
                      <li key={version.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSongVersionId(version.id);
                            setEntryFilter(version.title);
                          }}
                          className="w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-muted"
                        >
                          {version.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              ) : null}
              {entryError ? <p className="text-sm text-destructive">{entryError}</p> : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
