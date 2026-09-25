import {
  isAudioFilename,
  STEM_PARTS,
  stemPartFromFilename,
  type Attachment,
  type AttachmentType,
  type MusicBrainzWorkMatch,
  type SongVersionDetail,
  type StorageUsage,
  type StemPart,
  type StreamingLinkType,
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

/** Files or Audio: what's attached, and an upload drop zone for editors. */
export function AttachmentsTab({
  kind,
  songVersionId,
  attachments,
  canEdit,
}: {
  kind: "files" | "audio";
  songVersionId: string;
  attachments: Attachment[];
  canEdit: boolean;
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
  const shown = attachments.filter((a) => (kind === "audio" ? a.type === "AUDIO" : a.type !== "AUDIO"));

  useEffect(() => {
    if (!canEdit) return;
    apiClient
      .getMyStorage()
      .then(setUsage)
      .catch(() => {});
  }, [canEdit, attachments.length]);

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
        await apiClient.uploadAttachment(songVersionId, fileType === "AUDIO" && kind === "files" ? "OTHER" : fileType, file, stemPart);
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

  async function setStemPart(attachment: Attachment, stemPart: StemPart | null) {
    setBusyId(attachment.id);
    setError(null);
    try {
      await apiClient.setAttachmentStemPart(songVersionId, attachment.id, stemPart);
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
                      {canEdit ? (
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
                  {kind === "audio" && canEdit ? (
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      {t("stems.part")}
                      <NativeSelect
                        compact
                        value={attachment.stemPart ?? ""}
                        disabled={busyId !== null}
                        aria-label={t("stems.partOf", { name: attachment.filename })}
                        onChange={(event) => void setStemPart(attachment, (event.target.value || null) as StemPart | null)}
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
                  {kind === "audio" ? <AudioPlayer songVersionId={songVersionId} attachment={attachment} /> : null}
                </li>
              ))}
            </ul>
          )}
          {kind === "audio" && canEdit ? <p className="text-xs text-muted-foreground">{t("stems.detectHint")}</p> : null}
          {kind === "audio" && mode !== "practice" && stemsOf(attachments).length > 0 ? (
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

      {canEdit ? (
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
              ) : (
                <span />
              )}
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
      ) : null}
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
            if (!version.canEdit) {
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
          {version.canEdit ? (
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
