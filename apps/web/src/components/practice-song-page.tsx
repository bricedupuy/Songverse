import { chartNotation, cueSectionsOf, getLanguageDisplayName, renderChart, type Attachment, type CapoDisplayModeValue, type ChordDiagramsValue, type DiagramPlayer, type ChordNotationValue, type LiveViewValue, type SongVersionDetail } from "@songverse/core";
import { CapoBadge } from "#/components/capo-badge";
import { Link, useRouter } from "@tanstack/react-router";
import { Mic, Pencil } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { MetronomeSongButton } from "#/components/metronome";
import { ChartColumnsPicker } from "#/components/chart-columns-picker";
import { useChartColumns } from "#/lib/chart-columns";
import { ChartWithDiagrams } from "#/components/chord-diagrams";
import { ChartOrPdf, songViewStore } from "#/components/chart-or-pdf";
import { StemDock } from "#/components/stem-dock";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import { YouTubeDock } from "#/components/youtube-dock";
import { apiClient } from "#/lib/api-client";
import { artistNames } from "#/lib/artists";
import { setMode } from "#/lib/mode";
import { stemFilesOf, useChosenMultitrack } from "#/lib/stem-engine";

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
  liveView,
  diagrams,
  colors,
  player,
}: {
  version: SongVersionDetail;
  attachments: Attachment[];
  references: string[];
  notation: ChordNotationValue;
  capoDisplay: CapoDisplayModeValue;
  /** How the player reads songs unless chosen for this one (issue #155). */
  liveView: LiveViewValue;
  /** Chord diagrams beside the chart (issue #207). */
  diagrams: ChordDiagramsValue;
  /** Chords coloured by family (issue #9). */
  colors: boolean;
  /** Left-handed diagrams and tunings (issue #207). */
  player?: DiagramPlayer;
}) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const columns = useChartColumns();
  const chart = useMemo(
    () =>
      renderChart(version.documentJson, null, {
        notation: chartNotation(notation),
        capoDisplay: capoDisplay === "FINGERED" ? "shapes" : "sounding",
        suggestedCapo: version.capo,
      }),
    [version, notation, capoDisplay],
  );
  const playable = stemFilesOf(attachments, useChosenMultitrack(version.id));
  const cueSections = useMemo(() => cueSectionsOf(version.documentJson), [version]);
  const youtubeId = version.identifiers.find((identifier) => identifier.type === "YOUTUBE")?.value ?? null;
  const returnTo = `/library/${version.id}`;
  const details = [
    ...references,
    chart.key,
    chart.tempo ? `${chart.tempo} BPM` : null,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-6" data-testid="practice-song">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
        {/* Its album art (issues #146, #152): small, beside the title, as in Edit. */}
        {version.imageUrl ? <img src={`${version.imageUrl}&w=128`} alt="" className="size-14 shrink-0 rounded-md object-cover shadow-sm sm:size-16" data-testid="song-art" /> : null}
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
          {/* The capo, hard to miss (issue #219). */}
          {chart.capo ? <CapoBadge capo={chart.capo} shapes={chart.capoShapes} /> : null}
        </div>
        </div>
        <div className="flex items-center gap-2">
          <MetronomeSongButton songId={version.id} tempo={chart.tempo} timeSignature={chart.timeSignature} variant="button" />
          <Button variant="outline" onClick={() => setMode("edit")}>
            <Pencil />
            {t("practice.edit")}
          </Button>
          <Button onClick={() => setMode("live")} render={<Link to="/library/$songVersionId/live" params={{ songVersionId: version.id }} />}>
              <Mic />
              {t("live.start")}
            </Button>
        </div>
      </div>

      {/* The chart, or its PDF (issue #152). */}
      <ChartOrPdf songVersionId={version.id} attachments={attachments} defaultView={liveView} store={songViewStore(version.id)}>
        <Card>
          <CardContent className="flex flex-col gap-3">
            <ChartColumnsPicker className="self-end" />
            <ChartWithDiagrams chart={chart} emptyText={t("sets.noChart")} columns={columns} diagrams={diagrams} notation={notation} colors={colors} player={player} songVersionId={version.id} />
          </CardContent>
        </Card>
      </ChartOrPdf>

      {/* Its stems or recording, else its YouTube video, docked at the bottom (issues #64, #66). */}
      {playable.stems.length > 0 ? (
        <StemDock
          song={{
            songVersionId: version.id,
            title: version.title,
            returnTo,
            ...playable,
            load: (file, onProgress) => apiClient.downloadAttachment(version.id, file.id, onProgress),
            tempo: chart.tempo,
            timeSignature: chart.timeSignature,
            songKey: chart.key,
            cueSections,
            record: { attachments, songKey: chart.key ?? undefined, onSaved: () => void router.invalidate() },
          }}
        />
      ) : youtubeId ? (
        <YouTubeDock video={{ songVersionId: version.id, videoId: youtubeId, title: version.title, returnTo }} />
      ) : null}
    </div>
  );
}
