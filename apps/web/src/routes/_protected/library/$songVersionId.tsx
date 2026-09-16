import { CONTRIBUTOR_ROLES } from "@songverse/core";
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
  const [key, setKey] = useState(version.documentJson.defaults.key ?? "");
  const [tempo, setTempo] = useState(version.documentJson.defaults.tempo?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [chordpro, setChordpro] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [contributorName, setContributorName] = useState("");
  const [contributorRole, setContributorRole] = useState<(typeof CONTRIBUTOR_ROLES)[number]>("performer");
  const [addingContributor, setAddingContributor] = useState(false);
  const [contributorError, setContributorError] = useState<string | null>(null);
  const [removingContributorId, setRemovingContributorId] = useState<string | null>(null);

  const dirty =
    title !== version.title ||
    alternateTitle !== (version.alternateTitle ?? "") ||
    language !== version.language ||
    ccli !== (version.ccli ?? "") ||
    key !== (version.documentJson.defaults.key ?? "") ||
    tempo !== (version.documentJson.defaults.tempo?.toString() ?? "");

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      await apiClient.updateSongVersion(version.id, {
        title,
        alternateTitle: alternateTitle || undefined,
        language,
        ccli: ccli || undefined,
        key: key || undefined,
        tempo: tempo ? Number(tempo) : undefined,
      });
      await router.invalidate();
    } catch {
      setSaveError("Couldn't save changes. Check the fields and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function addContributor() {
    setAddingContributor(true);
    setContributorError(null);
    try {
      await apiClient.addContributor(version.id, contributorName, [contributorRole]);
      setContributorName("");
      await router.invalidate();
    } catch {
      setContributorError("Couldn't add that contributor. Try again.");
    } finally {
      setAddingContributor(false);
    }
  }

  async function removeContributor(contributorId: string) {
    setRemovingContributorId(contributorId);
    try {
      await apiClient.removeContributor(version.id, contributorId);
      await router.invalidate();
    } finally {
      setRemovingContributorId(null);
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
          <div className="flex gap-4">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="key">Key</Label>
              <Input id="key" value={key} onChange={(e) => setKey(e.target.value)} placeholder="G, Bb, C#m…" />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="tempo">Tempo (BPM)</Label>
              <Input
                id="tempo"
                type="number"
                min={1}
                value={tempo}
                onChange={(e) => setTempo(e.target.value)}
              />
            </div>
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
        <CardContent className="flex flex-col gap-4">
          {version.contributors.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              None yet — add one below, or link a MusicBrainz recording to attach its artist automatically.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {version.contributors.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>
                    <span className="font-medium">{contributorLabel(c)}</span>{" "}
                    <span className="text-muted-foreground">
                      ({c.roles.join(", ").toLowerCase()}
                      {c.isAutoAttached ? " · via MusicBrainz" : ""})
                    </span>
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void removeContributor(c.id)}
                    disabled={removingContributorId !== null}
                  >
                    {removingContributorId === c.id ? "Removing…" : "Remove"}
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-end gap-2 border-t pt-4">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="contributorName">Name</Label>
              <Input
                id="contributorName"
                value={contributorName}
                onChange={(e) => setContributorName(e.target.value)}
                placeholder="e.g. an artist, composer, or lyricist"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contributorRole">Role</Label>
              <select
                id="contributorRole"
                value={contributorRole}
                onChange={(e) => setContributorRole(e.target.value as (typeof CONTRIBUTOR_ROLES)[number])}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                {CONTRIBUTOR_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role === "performer" ? "Performer / Artist" : role.charAt(0).toUpperCase() + role.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <Button onClick={() => void addContributor()} disabled={addingContributor || !contributorName.trim()}>
              {addingContributor ? "Adding…" : "Add"}
            </Button>
          </div>
          {contributorError ? <p className="text-sm text-destructive">{contributorError}</p> : null}
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
