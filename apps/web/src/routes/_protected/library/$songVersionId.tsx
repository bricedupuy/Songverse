import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { apiClient } from "#/lib/api-client";
import { MusicBrainzMatchPanel } from "#/components/musicbrainz-match-panel";
import { SongChart } from "#/components/song-chart";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";

export const Route = createFileRoute("/_protected/library/$songVersionId")({
  loader: async ({ params }) => {
    const version = await apiClient.getSongVersion(params.songVersionId);
    const [work, recordingMatch] = await Promise.all([
      apiClient.getWork(version.workId),
      apiClient.getSongVersionMusicBrainz(version.id),
    ]);
    const workMatch = await apiClient.getWorkMusicBrainz(work.id);
    return { version, work, recordingMatch, workMatch };
  },
  component: SongVersionDetail,
});

function contributorLabel(c: { userId: string | null; source: string | null }): string {
  return c.source ?? c.userId ?? "Unknown contributor";
}

function SongVersionDetail() {
  const { version, work, recordingMatch, workMatch } = Route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();

  const [title, setTitle] = useState(version.title);
  const [alternateTitle, setAlternateTitle] = useState(version.alternateTitle ?? "");
  const [language, setLanguage] = useState(version.language);
  const [ccli, setCcli] = useState(version.ccli ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [chordpro, setChordpro] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const dirty =
    title !== version.title ||
    alternateTitle !== (version.alternateTitle ?? "") ||
    language !== version.language ||
    ccli !== (version.ccli ?? "");

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      await apiClient.updateSongVersion(version.id, {
        title,
        alternateTitle: alternateTitle || undefined,
        language,
        ccli: ccli || undefined,
      });
      await router.invalidate();
    } catch {
      setSaveError("Couldn't save changes. Check the fields and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function importContent() {
    setImporting(true);
    setImportError(null);
    try {
      await apiClient.importChordPro(version.id, chordpro);
      setChordpro("");
      await router.invalidate();
    } catch {
      setImportError("Couldn't parse that. Check the text and try again.");
    } finally {
      setImporting(false);
    }
  }

  async function remove() {
    setDeleting(true);
    try {
      await apiClient.deleteSongVersion(version.id);
      await navigate({ to: "/library" });
    } catch {
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{version.title}</h1>
          <p className="text-sm text-muted-foreground">
            {version.language} · {version.publicationState}
          </p>
        </div>
        {confirmingDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Delete this song?</span>
            <Button variant="destructive" size="sm" onClick={() => void remove()} disabled={deleting}>
              {deleting ? "Deleting…" : "Confirm"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setConfirmingDelete(true)}>
            Delete
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Details</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="alternateTitle">Alternate title</Label>
            <Input id="alternateTitle" value={alternateTitle} onChange={(e) => setAlternateTitle(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="language">Language (BCP 47)</Label>
            <Input id="language" value={language} onChange={(e) => setLanguage(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ccli">CCLI</Label>
            <Input id="ccli" value={ccli} onChange={(e) => setCcli(e.target.value)} />
          </div>
          {saveError ? <p className="text-sm text-destructive">{saveError}</p> : null}
          <Button onClick={() => void save()} disabled={!dirty || saving || !title.trim() || !language.trim()}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Content</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <SongChart sections={version.documentJson.sections} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="chordpro">
              {version.documentJson.sections.length === 0 ? "Paste ChordPro text" : "Replace with new ChordPro text"}
            </Label>
            <Textarea
              id="chordpro"
              rows={8}
              value={chordpro}
              onChange={(e) => setChordpro(e.target.value)}
              placeholder={"{start_of_verse}\n[G]Amazing [C]grace how [G]sweet the sound\n{end_of_verse}"}
              className="font-mono"
            />
          </div>
          {importError ? <p className="text-sm text-destructive">{importError}</p> : null}
          <Button onClick={() => void importContent()} disabled={importing || !chordpro.trim()} className="self-start">
            {importing ? "Importing…" : "Import"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Contributors</CardTitle>
        </CardHeader>
        <CardContent>
          {version.contributors.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              None yet — linking a MusicBrainz recording below will attach its artist automatically.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {version.contributors.map((c) => (
                <li key={c.id} className="text-sm">
                  <span className="font-medium">{contributorLabel(c)}</span>{" "}
                  <span className="text-muted-foreground">({c.roles.join(", ").toLowerCase()})</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">MusicBrainz recording (artist, album)</CardTitle>
        </CardHeader>
        <CardContent>
          <MusicBrainzMatchPanel
            kind="recording"
            initialQuery={version.title}
            current={recordingMatch}
            onSearch={(t, a) => apiClient.searchMusicBrainzRecordings(t, a)}
            onLink={async (mbid) => {
              await apiClient.linkSongVersionMusicBrainz(version.id, mbid);
              await router.invalidate();
            }}
            onUnlink={async () => {
              await apiClient.unlinkSongVersionMusicBrainz(version.id);
              await router.invalidate();
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">MusicBrainz work (composition, ISWC)</CardTitle>
        </CardHeader>
        <CardContent>
          <MusicBrainzMatchPanel
            kind="work"
            initialQuery={version.title}
            current={workMatch}
            onSearch={(t) => apiClient.searchMusicBrainzWorks(t)}
            onLink={async (mbid) => {
              await apiClient.linkWorkMusicBrainz(work.id, mbid);
              await router.invalidate();
            }}
            onUnlink={async () => {
              await apiClient.unlinkWorkMusicBrainz(work.id);
              await router.invalidate();
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
