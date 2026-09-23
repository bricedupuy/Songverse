import { CONTRIBUTOR_ROLES, detectImportFormat, resolveTranslation, type AttachmentType, type LocaleValue } from "@songverse/core";
import { AttachmentThumbnail } from "#/components/attachment-thumbnail";

const ATTACHMENT_TYPES: AttachmentType[] = ["PDF", "CHORDPRO", "MUSICXML", "ABC_NOTATION", "TEXT", "IMAGE"];

const NON_ARTIST_ROLES = CONTRIBUTOR_ROLES.filter((r) => r !== "performer");
import { createFileRoute, Link, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "#/lib/api-client";
import { LanguageSelect } from "#/components/language-select";
import { MusicBrainzMatchPanel } from "#/components/musicbrainz-match-panel";
import { SongChart } from "#/components/song-chart";
import { StreamingLinkRow } from "#/components/streaming-link-row";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";

export const Route = createFileRoute("/_protected/library/$songVersionId")({
  loader: async ({ params }) => {
    const version = await apiClient.getSongVersion(params.songVersionId).catch(() => null);
    if (!version) throw redirect({ to: "/library" });
    const [work, recordingMatch, tagCategories, availableTags, songbookMemberships, attachments] = await Promise.all([
      apiClient.getWork(version.workId),
      apiClient.getSongVersionMusicBrainz(version.id),
      apiClient.listTagCategories(),
      apiClient.listTags(),
      apiClient.getSongVersionSongbooks(version.id),
      apiClient.listAttachments(version.id),
    ]);
    const workMatch = await apiClient.getWorkMusicBrainz(work.id);
    return { version, work, recordingMatch, workMatch, tagCategories, availableTags, songbookMemberships, attachments };
  },
  component: SongVersionDetail,
});

function contributorLabel(c: { userId: string | null; source: string | null }): string {
  return c.source ?? c.userId ?? "Unknown contributor";
}

function SongVersionDetail() {
  const { version, work, recordingMatch, workMatch, tagCategories, availableTags, songbookMemberships, attachments } =
    Route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const locale = i18n.language as LocaleValue;

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
  const [importFormat, setImportFormat] = useState<"CHORDPRO" | "CHORDS_OVER_LYRICS">("CHORDPRO");
  const [formatTouched, setFormatTouched] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [contributorName, setContributorName] = useState("");
  const [contributorRole, setContributorRole] = useState<(typeof NON_ARTIST_ROLES)[number]>("composer");
  const [addingContributor, setAddingContributor] = useState(false);
  const [contributorError, setContributorError] = useState<string | null>(null);
  const [removingContributorId, setRemovingContributorId] = useState<string | null>(null);
  const [artistName, setArtistName] = useState("");
  const [addingArtist, setAddingArtist] = useState(false);
  const [artistError, setArtistError] = useState<string | null>(null);
  const [togglingTagId, setTogglingTagId] = useState<string | null>(null);
  const [tagError, setTagError] = useState<string | null>(null);
  const [attachmentType, setAttachmentType] = useState<AttachmentType>("CHORDPRO");
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [downloadingAttachmentId, setDownloadingAttachmentId] = useState<string | null>(null);
  const [removingAttachmentId, setRemovingAttachmentId] = useState<string | null>(null);

  const otherContributors = version.contributors.filter((c) => !c.roles.includes("PERFORMER"));
  const tagIds = new Set(version.tags.map((t) => t.id));
  const tagsByCategory = tagCategories
    .map((category) => ({ category, tags: availableTags.filter((t) => t.categoryId === category.id) }))
    .filter(({ tags }) => tags.length > 0);

  async function toggleTag(tagId: string, isOn: boolean) {
    setTogglingTagId(tagId);
    setTagError(null);
    try {
      if (isOn) {
        await apiClient.removeSongVersionTag(version.id, tagId);
      } else {
        await apiClient.addSongVersionTag(version.id, tagId);
      }
      await router.invalidate();
    } catch {
      setTagError("Couldn't update that tag. Try again.");
    } finally {
      setTogglingTagId(null);
    }
  }

  async function addArtist() {
    setAddingArtist(true);
    setArtistError(null);
    try {
      await apiClient.addContributor(version.id, artistName, ["performer"]);
      setArtistName("");
      await router.invalidate();
    } catch {
      setArtistError("Couldn't add that artist. Try again.");
    } finally {
      setAddingArtist(false);
    }
  }

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
      await apiClient.importSongText(version.id, chordpro, importFormat);
      setChordpro("");
      setFormatTouched(false);
      await router.invalidate();
    } catch {
      setImportError("Couldn't parse that. Check the text and try again.");
    } finally {
      setImporting(false);
    }
  }

  async function exportContent() {
    setExporting(true);
    setExportError(null);
    try {
      const { content } = await apiClient.exportChordPro(version.id);
      const blob = new Blob([content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${version.title}.cho`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError("Couldn't export this song. Try again.");
    } finally {
      setExporting(false);
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

  async function uploadAttachment(file: File) {
    setUploadingAttachment(true);
    setAttachmentError(null);
    try {
      await apiClient.uploadAttachment(version.id, attachmentType, file);
      await router.invalidate();
    } catch (err) {
      setAttachmentError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploadingAttachment(false);
    }
  }

  async function downloadAttachment(attachmentId: string, filename: string) {
    setDownloadingAttachmentId(attachmentId);
    setAttachmentError(null);
    try {
      const blob = await apiClient.downloadAttachment(version.id, attachmentId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setAttachmentError(err instanceof Error ? err.message : String(err));
    } finally {
      setDownloadingAttachmentId(null);
    }
  }

  async function removeAttachment(attachmentId: string) {
    setRemovingAttachmentId(attachmentId);
    setAttachmentError(null);
    try {
      await apiClient.deleteAttachment(version.id, attachmentId);
      await router.invalidate();
    } catch (err) {
      setAttachmentError(err instanceof Error ? err.message : String(err));
    } finally {
      setRemovingAttachmentId(null);
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
            <Label htmlFor="artistName">Artist</Label>
            {version.artists.length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {version.artists.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm"
                  >
                    <span>{a.source ?? a.userId ?? "Unknown artist"}</span>
                    <button
                      type="button"
                      onClick={() => void removeContributor(a.id)}
                      disabled={removingContributorId !== null}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={`Remove ${a.source ?? "artist"}`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="flex gap-2">
              <Input
                id="artistName"
                value={artistName}
                onChange={(e) => setArtistName(e.target.value)}
                placeholder="e.g. the performing artist or band"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => void addArtist()}
                disabled={addingArtist || !artistName.trim()}
              >
                {addingArtist ? "Adding…" : "Add"}
              </Button>
            </div>
            {artistError ? <p className="text-sm text-destructive">{artistError}</p> : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="alternateTitle">Alternate title</Label>
            <Input id="alternateTitle" value={alternateTitle} onChange={(e) => setAlternateTitle(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="language">Language</Label>
            <LanguageSelect id="language" value={language} onChange={setLanguage} />
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
            <div className="flex items-center justify-between">
              <Label htmlFor="chordpro">
                {version.documentJson.sections.length === 0 ? "Paste chord chart text" : "Replace with new text"}
              </Label>
              <div className="flex items-center gap-2">
                {!formatTouched && chordpro.trim() ? (
                  <span className="text-xs text-muted-foreground">auto-detected</span>
                ) : null}
                <select
                  value={importFormat}
                  onChange={(e) => {
                    setImportFormat(e.target.value as "CHORDPRO" | "CHORDS_OVER_LYRICS");
                    setFormatTouched(true);
                  }}
                  className="h-8 rounded-md border border-input bg-transparent px-2 text-xs shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <option value="CHORDPRO">ChordPro format</option>
                  <option value="CHORDS_OVER_LYRICS">Chords over lyrics</option>
                </select>
              </div>
            </div>
            <Textarea
              id="chordpro"
              rows={8}
              value={chordpro}
              onChange={(e) => {
                const value = e.target.value;
                setChordpro(value);
                if (!formatTouched && value.trim()) setImportFormat(detectImportFormat(value));
              }}
              placeholder={
                importFormat === "CHORDPRO"
                  ? "{start_of_verse}\n[G]Some lyric [C]line goes [G]here\n{end_of_verse}"
                  : "Verse 1\nG          C\nSome lyric line goes here"
              }
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Format is guessed from what you paste — pick it manually above if it guesses wrong. "Chords over
              lyrics" is the plain format most tab/chord sites show on-screen, chords on their own line directly
              above the lyric line. Paste text you have the right to use; SongVerse doesn't fetch or scrape content
              from other sites.
            </p>
          </div>
          {importError ? <p className="text-sm text-destructive">{importError}</p> : null}
          <div className="flex items-center gap-2">
            <Button onClick={() => void importContent()} disabled={importing || !chordpro.trim()}>
              {importing ? "Importing…" : "Import"}
            </Button>
            {version.documentJson.sections.length > 0 ? (
              <Button variant="outline" onClick={() => void exportContent()} disabled={exporting}>
                {exporting ? "Exporting…" : "Export as ChordPro"}
              </Button>
            ) : null}
          </div>
          {exportError ? <p className="text-sm text-destructive">{exportError}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Attachments</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {attachments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No files attached yet - the original ChordPro upload, scanned sheet music (PDF), or other reference
              files.
            </p>
          ) : (
            <ul className="flex flex-col divide-y">
              {attachments.map((attachment) => (
                <li key={attachment.id} className="flex items-center justify-between gap-4 py-2 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-3">
                    {attachment.type === "IMAGE" || attachment.mimeType.startsWith("image/") ? (
                      <AttachmentThumbnail songVersionId={version.id} attachmentId={attachment.id} alt={attachment.filename} />
                    ) : null}
                    <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium">{attachment.type}</span>
                    <span className="text-sm">{attachment.filename}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void downloadAttachment(attachment.id, attachment.filename)}
                      disabled={downloadingAttachmentId === attachment.id}
                    >
                      {downloadingAttachmentId === attachment.id ? "Downloading…" : "Download"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void removeAttachment(attachment.id)}
                      disabled={removingAttachmentId !== null}
                    >
                      {removingAttachmentId === attachment.id ? "Removing…" : "Remove"}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-end gap-2 border-t pt-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="attachment-type">Type</Label>
              <select
                id="attachment-type"
                value={attachmentType}
                onChange={(e) => setAttachmentType(e.target.value as AttachmentType)}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                {ATTACHMENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="attachment-file">File</Label>
              <input
                id="attachment-file"
                type="file"
                disabled={uploadingAttachment}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void uploadAttachment(file);
                }}
                className="text-sm"
              />
            </div>
            {uploadingAttachment ? <span className="text-sm text-muted-foreground">Uploading…</span> : null}
          </div>
          {attachmentError ? <p className="text-sm text-destructive">{attachmentError}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Links</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <StreamingLinkRow
            id="spotify"
            label="Spotify"
            current={version.identifiers.find((i) => i.type === "SPOTIFY")}
            onSave={async (url) => {
              await apiClient.setStreamingLink(version.id, "SPOTIFY", url);
              await router.invalidate();
            }}
            onRemove={async () => {
              await apiClient.removeStreamingLink(version.id, "SPOTIFY");
              await router.invalidate();
            }}
          />
          <StreamingLinkRow
            id="appleMusic"
            label="Apple Music"
            current={version.identifiers.find((i) => i.type === "APPLE_MUSIC")}
            onSave={async (url) => {
              await apiClient.setStreamingLink(version.id, "APPLE_MUSIC", url);
              await router.invalidate();
            }}
            onRemove={async () => {
              await apiClient.removeStreamingLink(version.id, "APPLE_MUSIC");
              await router.invalidate();
            }}
          />
          <StreamingLinkRow
            id="youtube"
            label="YouTube"
            current={version.identifiers.find((i) => i.type === "YOUTUBE")}
            onSave={async (url) => {
              await apiClient.setStreamingLink(version.id, "YOUTUBE", url);
              await router.invalidate();
            }}
            onRemove={async () => {
              await apiClient.removeStreamingLink(version.id, "YOUTUBE");
              await router.invalidate();
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Contributors</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {otherContributors.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              None yet — add a composer, lyricist, or other credit below. (Artists have their own field up in Details.)
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {otherContributors.map((c) => (
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
                onChange={(e) => setContributorRole(e.target.value as (typeof NON_ARTIST_ROLES)[number])}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                {NON_ARTIST_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role.charAt(0).toUpperCase() + role.slice(1)}
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
          <CardTitle className="text-sm">Tags</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {tagsByCategory.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tags available yet.</p>
          ) : (
            tagsByCategory.map(({ category, tags }) => (
              <div key={category.id} className="flex flex-col gap-1.5">
                <Label>{resolveTranslation(category.label, category.translations, locale)}</Label>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => {
                    const isOn = tagIds.has(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => void toggleTag(tag.id, isOn)}
                        disabled={togglingTagId !== null}
                        className={
                          isOn
                            ? "rounded-full border border-primary bg-primary px-3 py-1 text-sm text-primary-foreground disabled:opacity-50"
                            : "rounded-full border px-3 py-1 text-sm text-muted-foreground hover:bg-accent disabled:opacity-50"
                        }
                      >
                        {resolveTranslation(tag.label, tag.translations, locale)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
          {tagError ? <p className="text-sm text-destructive">{tagError}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Songbooks</CardTitle>
        </CardHeader>
        <CardContent>
          {songbookMemberships.length === 0 ? (
            <p className="text-sm text-muted-foreground">This song isn't in any songbook yet.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {songbookMemberships.map((membership) => (
                <li
                  key={membership.songbookId}
                  className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                >
                  <Link
                    to="/songbooks/$songbookId"
                    params={{ songbookId: membership.songbookId }}
                    className="text-sm hover:text-primary"
                  >
                    {membership.songbookName}
                  </Link>
                  <div className="flex items-center gap-2">
                    {membership.entryCode ? (
                      <span className="rounded-md bg-muted px-2 py-1 text-center text-xs font-medium">
                        {membership.entryCode}
                      </span>
                    ) : null}
                    {membership.sectionLabel ? (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        {membership.sectionLabel}
                      </span>
                    ) : null}
                  </div>
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
