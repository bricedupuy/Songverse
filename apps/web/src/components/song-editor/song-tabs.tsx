import {
  isAudioFilename,
  STEM_PARTS,
  stemPartFromFilename,
  type Attachment,
  type AttachmentAudience,
  type AttachmentType,
  type MusicBrainzWorkMatch,
  type SongVersionDetail,
  type StorageUsage,
  type StemPart,
  type StreamingLinkType,
  type TeamSummary,
} from "@songverse/core";
import { useRouter } from "@tanstack/react-router";
import { Download, FileAudio, Play, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AttachmentThumbnail } from "#/components/attachment-thumbnail";
import { MusicBrainzMatchPanel } from "#/components/musicbrainz-match-panel";
import { StreamingLinkRow } from "#/components/streaming-link-row";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { apiClient } from "#/lib/api-client";
import { cn } from "#/lib/utils";
import { attachmentTypeFor } from "./attachment-types";
import { downloadBlob } from "#/lib/download";
import { formatBytes } from "#/lib/format-bytes";
import { NativeSelect } from "#/components/ui/native-select";
import { Input } from "#/components/ui/input";
import { KeySelect } from "#/components/key-select";
import { setMode, useMode } from "#/lib/mode";
import { stemsOf } from "#/lib/stem-engine";

export function SaveFirst() {
  const { t } = useTranslation();
  return (
    <Card>
      <CardContent className="py-8 text-center text-sm text-muted-foreground">{t("songEditor.saveFirst")}</CardContent>
    </Card>
  );
}

const FILE_TYPES: AttachmentType[] = ["PDF", "CHORDPRO", "MUSICXML", "ABC_NOTATION", "TEXT", "IMAGE", "OTHER"];

/** A file's audience as one select value: "PRIVATE", "SONG", "SHARED" or "TEAM:<id>". */
const audienceValue = (audience: AttachmentAudience) => (audience.visibility === "TEAM" ? `TEAM:${audience.teamId}` : audience.visibility);
const audienceOf = (value: string): AttachmentAudience =>
  value.startsWith("TEAM:") ? { visibility: "TEAM", teamId: value.slice(5) } : { visibility: value as "PRIVATE" | "SONG" | "SHARED" };

/**
 * Who sees a file (issue #72): only me, one of my teams, everyone who can
 * see the song, or the people it's shared with (#79) - those two for who
 * manages the song.
 */
function AudienceSelect({
  value,
  teams,
  canShowToSong,
  canShowToShared,
  disabled,
  label,
  onChange,
}: {
  value: AttachmentAudience;
  teams: TeamSummary[];
  canShowToSong: boolean;
  canShowToShared: boolean;
  disabled?: boolean;
  label: string;
  onChange: (audience: AttachmentAudience) => void;
}) {
  const { t } = useTranslation();
  // A team the file is shown to but that isn't in the list (left since) still shows.
  const listed = value.visibility === "TEAM" && value.teamId && !teams.some((team) => team.id === value.teamId);
  return (
    <NativeSelect compact value={audienceValue(value)} disabled={disabled} aria-label={label} onChange={(event) => onChange(audienceOf(event.target.value))}>
      <option value="PRIVATE">{t("fileVisibility.private")}</option>
      {teams.map((team) => (
        <option key={team.id} value={`TEAM:${team.id}`}>
          {t("fileVisibility.team", { team: team.name })}
        </option>
      ))}
      {listed ? <option value={audienceValue(value)}>{t("fileVisibility.team", { team: "…" })}</option> : null}
      {canShowToShared || value.visibility === "SHARED" ? <option value="SHARED">{t("fileVisibility.shared")}</option> : null}
      {canShowToSong || value.visibility === "SONG" ? <option value="SONG">{t("fileVisibility.song")}</option> : null}
    </NativeSelect>
  );
}

/** Who sees a file, for someone who can't change it. */
function audienceText(attachment: Attachment, t: (key: string, options?: Record<string, unknown>) => string): string {
  const by = attachment.uploadedBy?.displayName;
  if (attachment.visibility === "TEAM") return t(by ? "fileVisibility.sharedByWithTeam" : "fileVisibility.sharedWithTeam", { name: by, team: attachment.visibleToTeam?.name ?? "" });
  if (attachment.visibility === "PRIVATE") return t("fileVisibility.privateOf", { name: by ?? "" });
  if (attachment.visibility === "SHARED") return by ? t("fileVisibility.sharedByWithPeople", { name: by }) : t("fileVisibility.sharedWithPeople");
  return by ? t("fileVisibility.addedBy", { name: by }) : "";
}

function AudioPlayer({ songVersionId, attachment }: { songVersionId: string; attachment: Attachment }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  // Where to carry on from once a fresh link has loaded.
  const resumeAt = useRef<number | null>(null);
  const renewed = useRef(false);

  async function load() {
    setLoading(true);
    setError(false);
    try {
      // A signed link (issue #33): the <audio> streams and seeks by itself, which it can't with the Bearer token.
      setUrl((await apiClient.getAttachmentLink(songVersionId, attachment.id)).url);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  // A link that ran out mid-rehearsal: a new one, from where it was.
  async function renew() {
    if (renewed.current) {
      setError(true);
      return;
    }
    renewed.current = true;
    resumeAt.current = audio.current?.currentTime ?? 0;
    await load();
  }

  if (url) {
    return (
      <>
        <audio
          ref={audio}
          controls
          autoPlay
          preload="metadata"
          src={url}
          className="h-9 w-full"
          aria-label={attachment.filename}
          onError={() => void renew()}
          onLoadedMetadata={(event) => {
            if (resumeAt.current !== null) event.currentTarget.currentTime = resumeAt.current;
            resumeAt.current = null;
          }}
          onPlaying={() => {
            renewed.current = false;
          }}
        />
        {error ? <span className="text-xs text-destructive">{t("songEditor.audioFailed")}</span> : null}
      </>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <Button type="button" size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
        <Play />
        {loading ? t("songEditor.loadingAudio") : t("songEditor.play")}
      </Button>
      {error ? <span className="text-xs text-destructive">{t("songEditor.audioFailed")}</span> : null}
    </div>
  );
}

/**
 * A recording's key and tempo (issue #65), when they aren't the song's -
 * for later, to transpose it and change its speed. Empty is the song's own.
 */
function RecordingFields({
  files,
  label,
  songKey,
  songTempo,
  canEdit,
  busy,
  onChange,
}: {
  files: Attachment[];
  /** Whose: a file's name; the stems when left out. */
  label?: string;
  songKey: string;
  songTempo: string;
  canEdit: boolean;
  busy: boolean;
  onChange: (change: { recordingKey?: string | null; recordingTempo?: number | null }) => void;
}) {
  const { t } = useTranslation();
  const first = files[0];
  const saved = first?.recordingTempo != null ? String(first.recordingTempo) : "";
  const [tempo, setTempo] = useState(saved);
  useEffect(() => setTempo(saved), [saved]);
  const keyLabel = label ? t("stems.recordingKey", { name: label }) : t("stems.stemsKey");
  const tempoLabel = label ? t("stems.recordingTempo", { name: label }) : t("stems.stemsTempo");

  if (!canEdit) {
    const details = [first?.recordingKey, first?.recordingTempo ? `${first.recordingTempo} BPM` : null].filter(Boolean).join(" · ");
    return details ? <p className="text-xs text-muted-foreground">{t("stems.recordedIn", { details })}</p> : null;
  }
  function saveTempo() {
    const next = tempo.trim() ? Number(tempo) : null;
    if ((next === null && !saved) || String(next) === saved || (next !== null && !Number.isFinite(next))) return;
    onChange({ recordingTempo: next });
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <label className="flex items-center gap-2">
        {t("stems.keyLabel")}
        <KeySelect
          compact
          value={first?.recordingKey ?? ""}
          disabled={busy}
          aria-label={keyLabel}
          noneLabel={songKey ? t("stems.songsKeyIs", { key: songKey }) : t("stems.songsKey")}
          onChange={(value) => onChange({ recordingKey: value || null })}
        />
      </label>
      <label className="flex items-center gap-2">
        {t("stems.tempoLabel")}
        <Input
          type="number"
          inputMode="decimal"
          min={20}
          max={400}
          step="any"
          value={tempo}
          disabled={busy}
          placeholder={songTempo || "BPM"}
          aria-label={tempoLabel}
          className="h-8 w-20 text-xs"
          onChange={(event) => setTempo(event.target.value)}
          onBlur={saveTempo}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              saveTempo();
            }
          }}
        />
      </label>
    </div>
  );
}

/** Files or Audio: what's attached, and an upload drop zone for editors. */
export function AttachmentsTab({
  kind,
  songVersionId,
  attachments,
  canEdit,
  canShare = false,
  songKey = "",
  songTempo = "",
}: {
  kind: "files" | "audio";
  songVersionId: string;
  attachments: Attachment[];
  /** Can edit the song: can show files to everyone who sees it. Anyone who sees it adds their own. */
  canEdit: boolean;
  /** Can show files to the people the song is shared with (#79): who manages a personal or team song. */
  canShare?: boolean;
  /** The song's own, which a recording's key and tempo default to (#65). */
  songKey?: string;
  songTempo?: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { mode } = useMode();
  const inputRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<AttachmentType | "AUTO">("AUTO");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  // Who sees what's added: only its uploader, until they choose otherwise (issue #72).
  const [audience, setAudience] = useState<AttachmentAudience>({ visibility: "PRIVATE" });
  const stems = kind === "audio" ? stemsOf(attachments) : [];
  const changeableStems = stems.filter((stem) => stem.canChange);
  const shown = attachments.filter((a) => (kind === "audio" ? a.type === "AUDIO" : a.type !== "AUDIO"));

  useEffect(() => {
    apiClient
      .getMyStorage()
      .then(setUsage)
      .catch(() => {});
  }, [attachments.length]);
  useEffect(() => {
    apiClient
      .listTeams()
      .then(setTeams)
      .catch(() => {});
  }, []);

  async function upload(files: File[]) {
    setError(null);
    for (const file of files) {
      const fileType = kind === "audio" ? "AUDIO" : type === "AUTO" ? attachmentTypeFor(file) : type;
      // Some browsers give an .opus file no type: its name says it's audio.
      if (kind === "audio" && !file.type.startsWith("audio/") && !isAudioFilename(file.name)) {
        setError(t("songEditor.notAudio", { name: file.name }));
        continue;
      }
      setUploading(file.name);
      try {
        // "Song - Vocals.mp3" is the vocals stem (issue #64); the part can be changed below the file.
        const stemPart = kind === "audio" ? stemPartFromFilename(file.name) : null;
        await apiClient.uploadAttachment(songVersionId, fileType === "AUDIO" && kind === "files" ? "OTHER" : fileType, file, stemPart, audience);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    }
    setUploading(null);
    await router.invalidate();
  }

  async function download(attachment: Attachment) {
    setBusyId(attachment.id);
    setError(null);
    try {
      const blob = await apiClient.downloadAttachment(songVersionId, attachment.id);
      downloadBlob(blob, attachment.filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  /** Saves a change to one or more audio files at once (all the stems share their recording's key and tempo). */
  async function update(files: Attachment[], change: Parameters<typeof apiClient.updateAttachment>[2]) {
    setBusyId(files[0]?.id ?? null);
    setError(null);
    try {
      await Promise.all(files.map((file) => apiClient.updateAttachment(songVersionId, file.id, change)));
      await router.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(attachment: Attachment) {
    setBusyId(attachment.id);
    setError(null);
    try {
      await apiClient.deleteAttachment(songVersionId, attachment.id);
      await router.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t(kind === "audio" ? "songEditor.tabs.audio" : "songEditor.tabs.files")}</CardTitle>
          <CardDescription>{t(kind === "audio" ? "songEditor.audioDescription" : "songEditor.filesDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {shown.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t(kind === "audio" ? "songEditor.noAudio" : "songEditor.noFiles")}</p>
          ) : (
            <>
            {kind === "audio" && stems.length > 0 ? (
              <div className="flex flex-col gap-2 rounded-lg border p-3" data-testid="stems-recording">
                <p className="text-sm font-medium">{t("stems.recording")}</p>
                <p className="text-xs text-muted-foreground">{t("stems.recordingHint")}</p>
                <RecordingFields
                  files={changeableStems.length > 0 ? changeableStems : stems}
                  songKey={songKey}
                  songTempo={songTempo}
                  canEdit={changeableStems.length > 0}
                  busy={busyId !== null}
                  onChange={(change) => void update(changeableStems, change)}
                />
              </div>
            ) : null}
            <ul className="flex flex-col divide-y" data-testid={`${kind}-list`}>
              {shown.map((attachment) => (
                <li key={attachment.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-3">
                    {kind === "audio" ? (
                      <FileAudio className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                    ) : attachment.type === "IMAGE" || attachment.mimeType.startsWith("image/") ? (
                      <AttachmentThumbnail songVersionId={songVersionId} attachmentId={attachment.id} alt={attachment.filename} />
                    ) : (
                      <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium">{t(`songEditor.fileTypes.${attachment.type}`)}</span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm">{attachment.filename}</span>
                    {attachment.sizeBytes !== null ? (
                      <span className="text-xs text-muted-foreground">{formatBytes(attachment.sizeBytes)}</span>
                    ) : null}
                    <span className="flex gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => void download(attachment)}
                        disabled={busyId !== null}
                        aria-label={t("songEditor.downloadName", { name: attachment.filename })}
                      >
                        <Download />
                      </Button>
                      {attachment.canChange ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => void remove(attachment)}
                          disabled={busyId !== null}
                          aria-label={t("songEditor.removeName", { name: attachment.filename })}
                        >
                          <Trash2 />
                        </Button>
                      ) : null}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" data-testid="file-visibility">
                    {attachment.canChangeVisibility ? (
                      <label className="flex items-center gap-2">
                        {t("fileVisibility.label")}
                        <AudienceSelect
                          value={{ visibility: attachment.visibility, teamId: attachment.visibleToTeamId }}
                          teams={teams}
                          canShowToSong={canEdit}
                          canShowToShared={canShare}
                          disabled={busyId !== null}
                          label={t("fileVisibility.labelFor", { name: attachment.filename })}
                          onChange={(next) => void update([attachment], { visibility: next.visibility, teamId: next.teamId ?? null })}
                        />
                      </label>
                    ) : (
                      <span>{audienceText(attachment, t)}</span>
                    )}
                  </div>
                  {kind === "audio" && attachment.canChange ? (
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      {t("stems.part")}
                      <NativeSelect
                        compact
                        value={attachment.stemPart ?? ""}
                        disabled={busyId !== null}
                        aria-label={t("stems.partOf", { name: attachment.filename })}
                        onChange={(event) => void update([attachment], { stemPart: (event.target.value || null) as StemPart | null })}
                      >
                        <option value="">{t("stems.notAStem")}</option>
                        {STEM_PARTS.map((part) => (
                          <option key={part} value={part}>
                            {t(`stems.parts.${part}`)}
                          </option>
                        ))}
                      </NativeSelect>
                    </label>
                  ) : kind === "audio" && attachment.stemPart ? (
                    <span className="self-start rounded-md bg-muted px-2 py-1 text-xs font-medium">{t(`stems.parts.${attachment.stemPart}`)}</span>
                  ) : null}
                  {/* A recording on its own has its own key and tempo; the stems share theirs (above the list). */}
                  {kind === "audio" && !attachment.stemPart ? (
                    <RecordingFields
                      files={[attachment]}
                      label={attachment.filename}
                      songKey={songKey}
                      songTempo={songTempo}
                      canEdit={attachment.canChange}
                      busy={busyId !== null}
                      onChange={(change) => void update([attachment], change)}
                    />
                  ) : null}
                  {kind === "audio" ? <AudioPlayer songVersionId={songVersionId} attachment={attachment} /> : null}
                </li>
              ))}
            </ul>
            </>
          )}
          {kind === "audio" ? <p className="text-xs text-muted-foreground">{t("stems.detectHint")}</p> : null}
          {kind === "audio" && mode !== "practice" && stems.length > 0 ? (
            <Button type="button" variant="link" className="h-auto self-start p-0" onClick={() => setMode("practice")}>
              {t("stems.practiceHint")}
            </Button>
          ) : null}
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* Anyone who sees the song adds files of their own to it (issue #72). */}
      <Card>
        <CardContent className="flex flex-col gap-3">
          <div
            className={cn(
              "flex flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center text-sm",
              dragging ? "border-primary bg-primary/5" : "border-input",
            )}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void upload([...event.dataTransfer.files]);
            }}
          >
            <Upload className="size-5 text-muted-foreground" aria-hidden />
            <p>
              {t(kind === "audio" ? "songEditor.dropAudio" : "songEditor.dropFiles")}{" "}
              <button type="button" className="font-medium text-primary hover:underline" onClick={() => inputRef.current?.click()}>
                {t("songEditor.browse")}
              </button>
            </p>
            <p className="text-xs text-muted-foreground">{t(kind === "audio" ? "songEditor.audioLimit" : "songEditor.filesLimit")}</p>
            {!canEdit ? <p className="text-xs text-muted-foreground">{t("fileVisibility.ownHint")}</p> : null}
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={kind === "audio" ? "audio/*,.opus,.ogg,.mp3,.m4a,.wav,.flac" : undefined}
              className="sr-only"
              aria-label={t(kind === "audio" ? "songEditor.uploadAudio" : "songEditor.uploadFiles")}
              data-testid={`${kind}-input`}
              onChange={(event) => {
                const files = [...(event.target.files ?? [])];
                event.target.value = "";
                if (files.length) void upload(files);
              }}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-4">
              {kind === "files" ? (
                <label className="flex items-center gap-2 text-sm">
                  {t("songEditor.fileType")}
                  <NativeSelect value={type} onChange={(event) => setType(event.target.value as AttachmentType | "AUTO")}>
                    <option value="AUTO">{t("songEditor.fileTypeAuto")}</option>
                    {FILE_TYPES.map((option) => (
                      <option key={option} value={option}>
                        {t(`songEditor.fileTypes.${option}`)}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
              ) : null}
              <label className="flex items-center gap-2 text-sm">
                {t("fileVisibility.label")}
                <AudienceSelect
                  value={audience}
                  teams={teams}
                  canShowToSong={canEdit}
                  canShowToShared={canShare}
                  label={t("fileVisibility.forNew")}
                  onChange={setAudience}
                />
              </label>
            </div>
            {uploading ? (
              <span className="text-sm text-muted-foreground" role="status">
                {t("songEditor.uploading", { name: uploading })}
              </span>
            ) : usage ? (
              <span className="text-xs text-muted-foreground">
                {usage.limitBytes === null
                  ? t("songEditor.storageUsedUnlimited", { used: formatBytes(usage.usedBytes) })
                  : t("songEditor.storageUsed", { used: formatBytes(usage.usedBytes), limit: formatBytes(usage.limitBytes) })}
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const STREAMING: { type: StreamingLinkType; label: string }[] = [
  { type: "SPOTIFY", label: "Spotify" },
  { type: "APPLE_MUSIC", label: "Apple Music" },
  { type: "YOUTUBE", label: "YouTube" },
];

export function LinksTab({
  version,
  workMatch,
}: {
  version: SongVersionDetail;
  workMatch: MusicBrainzWorkMatch | null;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>{t("songEditor.links.streaming")}</CardTitle>
          <CardDescription>{t("songEditor.links.streamingDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {STREAMING.map(({ type, label }) => {
            const current = version.identifiers.find((identifier) => identifier.type === type);
            if (!version.canManage) {
              return (
                <p key={type} className="text-sm">
                  <span className="font-medium">{label}: </span>
                  {current?.sourceUrl ? (
                    <a href={current.sourceUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                      {current.sourceUrl}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </p>
              );
            }
            return (
              <StreamingLinkRow
                key={type}
                id={`link-${type}`}
                label={label}
                current={current}
                onSave={async (url) => {
                  await apiClient.setStreamingLink(version.id, type, url);
                  await router.invalidate();
                }}
                onRemove={async () => {
                  await apiClient.removeStreamingLink(version.id, type);
                  await router.invalidate();
                }}
              />
            );
          })}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("songEditor.links.work")}</CardTitle>
          <CardDescription>{t("songEditor.links.workDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {version.canManage ? (
            <MusicBrainzMatchPanel
              kind="work"
              initialQuery={version.title}
              current={workMatch}
              onSearch={(title) => apiClient.searchMusicBrainzWorks(title)}
              onLink={async (mbid) => {
                await apiClient.linkWorkMusicBrainz(version.workId, mbid);
                await router.invalidate();
              }}
              onUnlink={async () => {
                await apiClient.unlinkWorkMusicBrainz(version.workId);
                await router.invalidate();
              }}
            />
          ) : workMatch ? (
            <a href={workMatch.sourceUrl} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline">
              {workMatch.title}
              {workMatch.iswc ? ` · ISWC ${workMatch.iswc}` : ""}
            </a>
          ) : (
            <p className="text-sm text-muted-foreground">{t("songEditor.links.noWork")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
