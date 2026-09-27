import { getLanguageDisplayName, renderChart, type Attachment, type CapoDisplayModeValue, type ChordNotationValue, type SongVersionDetail } from "@songverse/core";
import { Link } from "@tanstack/react-router";
import { Mic, Pencil } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { MetronomeSongButton } from "#/components/metronome";
import { SongChart } from "#/components/song-chart";
import { StemDock } from "#/components/stem-dock";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import { YouTubeDock } from "#/components/youtube-dock";
import { apiClient } from "#/lib/api-client";
import { artistNames } from "#/lib/artists";
import { setMode } from "#/lib/mode";
import { playableOf } from "#/lib/stem-engine";

/**
 * A library song in Practice (issue #67): its chart, as written and read
 * through the player's chord settings, instead of the editor's tabs - with
 * Edit to go back to editing, and its stems, recording or YouTube video
 * docked at the bottom. A Practice toolbar comes later.
 */
export function PracticeSongPage({
  version,
  attachments,
  references,
  notation,
  capoDisplay,
}: {
  version: SongVersionDetail;
  attachments: Attachment[];
  references: string[];
  notation: ChordNotationValue;
  capoDisplay: CapoDisplayModeValue;
}) {
  const { t, i18n } = useTranslation();
  const chart = useMemo(
    () =>
      renderChart(version.documentJson, null, {
        notation: notation === "SOLFEGE" ? "solfege" : "english",
        capoDisplay: capoDisplay === "FINGERED" ? "shapes" : "sounding",
        suggestedCapo: version.capo,
      }),
    [version, notation, capoDisplay],
  );
  const playable = playableOf(attachments);
  const youtubeId = version.identifiers.find((identifier) => identifier.type === "YOUTUBE")?.value ?? null;
  const returnTo = `/library/${version.id}`;
  const details = [
    ...references,
    chart.key,
    chart.capo ? t("player.capo", { capo: chart.capo }) : null,
    chart.tempo ? `${chart.tempo} BPM` : null,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-6" data-testid="practice-song">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold">
            <span className="min-w-0 break-words">{version.title}</span>
            {version.versionName ? (
              <span className="rounded-full border px-2.5 py-0.5 text-sm font-medium text-muted-foreground">{version.versionName}</span>
            ) : null}
          </h1>
          <p className="text-sm text-muted-foreground">
            {[artistNames(version.artists), getLanguageDisplayName(version.language, i18n.language)].filter(Boolean).join(" · ")}
          </p>
          {details.length > 0 ? <p className="text-sm font-medium text-muted-foreground">{details.join(" · ")}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          <MetronomeSongButton songId={version.id} tempo={chart.tempo} timeSignature={chart.timeSignature} variant="button" />
          <Button variant="outline" onClick={() => setMode("edit")}>
            <Pencil />
            {t("practice.edit")}
          </Button>
          <Button asChild onClick={() => setMode("live")}>
            <Link to="/library/$songVersionId/live" params={{ songVersionId: version.id }}>
              <Mic />
              {t("live.start")}
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardContent>
          <SongChart chart={chart} emptyText={t("sets.noChart")} />
        </CardContent>
      </Card>

      {/* Its stems or recording, else its YouTube video, docked at the bottom (issues #64, #66). */}
      {playable.length > 0 ? (
        <StemDock
          song={{
            songVersionId: version.id,
            title: version.title,
            returnTo,
            stems: playable,
            load: (file, onProgress) => apiClient.downloadAttachment(version.id, file.id, onProgress),
            tempo: chart.tempo,
            timeSignature: chart.timeSignature,
          }}
        />
      ) : youtubeId ? (
        <YouTubeDock video={{ songVersionId: version.id, videoId: youtubeId, title: version.title, returnTo }} />
      ) : null}
    </div>
  );
}
