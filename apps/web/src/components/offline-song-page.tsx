import { findKeptSong, keptFile, keptSongCopy, offlineViewer, renderChart, type Attachment, type CapoDisplayModeValue, type ChordNotationValue, type FoundSong } from "@songverse/core";
import { Link } from "@tanstack/react-router";
import { FileText, Mic } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { SongChart } from "#/components/song-chart";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { formatBytes } from "#/lib/format-bytes";
import { setMode } from "#/lib/mode";
import { keysOffline } from "#/lib/offline-db";
import { deviceStorage } from "#/lib/offline-data";

/** A song as kept on the device, with its files' list and the player's chord settings. */
export interface OfflineSong extends FoundSong {
  attachments: Attachment[];
  notation: ChordNotationValue;
  capoDisplay: CapoDisplayModeValue;
}

/** The song as kept on the device (on its own, or in a kept set), if it is. */
export async function loadOfflineSong(songVersionId: string): Promise<OfflineSong | undefined> {
  const storage = deviceStorage();
  const [found, kept, viewer] = await Promise.all([findKeptSong(storage, songVersionId), keptSongCopy(storage, songVersionId), offlineViewer(storage)]);
  if (!found) return undefined;
  return {
    ...found,
    attachments: kept?.attachments ?? [],
    notation: viewer?.chordNotation ?? "LETTERS",
    capoDisplay: viewer?.capoDisplayMode ?? "SOUNDING",
  };
}

/**
 * A song's page offline (issue #52): read-only - its chart as written, with
 * the player's chord settings, the files kept on the device, and Live.
 */
export function OfflineSongPage({ song }: { song: OfflineSong }) {
  const { t } = useTranslation();
  const [keptFiles, setKeptFiles] = useState<Set<string>>(new Set());
  const chart = useMemo(
    () =>
      renderChart(song.document, null, {
        notation: song.notation === "SOLFEGE" ? "solfege" : "english",
        capoDisplay: song.capoDisplay === "FINGERED" ? "shapes" : "sounding",
        suggestedCapo: song.capo,
      }),
    [song],
  );

  useEffect(() => {
    void keysOffline("files").then((keys) => setKeptFiles(new Set(keys)));
  }, [song.songVersionId]);

  async function open(file: Attachment) {
    const blob = await keptFile<Blob>(deviceStorage(), file.id);
    if (!blob) return;
    // A blob: URL of this page's own origin, from the device.
    window.open(URL.createObjectURL(blob), "_blank");
  }

  return (
    <div className="flex flex-col gap-6" data-testid="offline-song">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-semibold">
            {song.title}
            {song.versionName ? <span className="font-normal text-muted-foreground"> — {song.versionName}</span> : null}
          </h1>
          {song.artists ? <p className="text-sm text-muted-foreground">{song.artists}</p> : null}
          <p className="text-sm text-muted-foreground">{t("offline.songReadOnly")}</p>
        </div>
        <Button asChild onClick={() => setMode("live")}>
          <Link to="/library/$songVersionId/live" params={{ songVersionId: song.songVersionId }}>
            <Mic />
            {t("live.start")}
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent>
          <SongChart chart={chart} />
        </CardContent>
      </Card>

      {song.attachments.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("offline.files")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {song.attachments.map((file) => (
              <div key={file.id} className="flex items-center gap-3 text-sm" data-testid="offline-file">
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{file.filename}</span>
                {file.sizeBytes ? <span className="text-xs text-muted-foreground">{formatBytes(file.sizeBytes)}</span> : null}
                {keptFiles.has(file.id) ? (
                  <Button variant="outline" size="sm" onClick={() => void open(file)}>
                    {t("offline.openFile")}
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">{t("offline.fileNotKept")}</span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
