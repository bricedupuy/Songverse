import { renderChart, type ChartPreferences, type RenderedChart, type ChordNotationValue, type CapoDisplayModeValue, type SetlistSongView } from "@songverse/core";
import { EyeOff } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChartColumnsPicker } from "#/components/chart-columns-picker";
import { useChartColumns } from "#/lib/chart-columns";
import { SongChart } from "#/components/song-chart";
import { apiClient } from "#/lib/api-client";
import { cn } from "#/lib/utils";

const EMPTY: ChartPreferences = { $schema: "chart-preferences/v1", hiddenChordIds: [], simplifyChords: false, hideBassNotes: false };

/** The chart of a set's song as the set plays it, through this player's view (their saved one by default). */
export function renderPlayerChart(
  view: SetlistSongView,
  preferences: ChartPreferences = view.view.preferences ?? EMPTY,
  notation: ChordNotationValue = view.view.chordNotation,
  capoDisplay: CapoDisplayModeValue = view.view.capoDisplayMode,
  /** Live's last-minute transpose, on top of the set's (issue #68). */
  extraSteps = 0,
): RenderedChart {
  const song = view.song!;
  return renderChart(song.document, view.arrangement?.document ?? null, {
    transposeSteps: view.item.transposeSteps + extraSteps,
    preferences,
    notation: notation === "SOLFEGE" ? "solfege" : "english",
    capoDisplay: capoDisplay === "FINGERED" ? "shapes" : "sounding",
    suggestedCapo: song.suggestedCapo,
  });
}

/**
 * A song of a set as this player reads it (docs/arrangement-document-v2.md,
 * "Personal chart preferences"): the arrangement the set plays, the set's
 * key on top, and the player's own view - chords they've hidden, simpler
 * chords, no bass notes, capo shapes, solfège. Changes save as they're
 * made, for this player only.
 */
export function PlayerChart({ view }: { view: SetlistSongView }) {
  const { t } = useTranslation();
  const song = view.song!;
  const [preferences, setPreferences] = useState<ChartPreferences>(view.view.preferences ?? EMPTY);
  const [notation, setNotation] = useState<ChordNotationValue>(view.view.chordNotation);
  const [capoDisplay, setCapoDisplay] = useState<CapoDisplayModeValue>(view.view.capoDisplayMode);
  const [hiding, setHiding] = useState(false);
  const columns = useChartColumns();
  const [error, setError] = useState<string | null>(null);

  // Another song of the set reuses this component.
  useEffect(() => {
    setPreferences(view.view.preferences ?? EMPTY);
    setHiding(false);
    setError(null);
  }, [view.item.id, view.item.arrangementId]);

  const chart = useMemo(() => renderPlayerChart(view, preferences, notation, capoDisplay), [view, preferences, notation, capoDisplay]);

  function savePreferences(next: ChartPreferences) {
    setPreferences(next);
    setError(null);
    // Its own fields only: the view (issue #155) is the view switch's, saved beside them.
    const mine = { hiddenChordIds: next.hiddenChordIds, simplifyChords: next.simplifyChords, hideBassNotes: next.hideBassNotes };
    apiClient.setSetlistChartPreferences(view.set.id, view.item.id, mine).catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }

  function saveSetting(change: { chordNotation?: ChordNotationValue; capoDisplayMode?: CapoDisplayModeValue }) {
    if (change.chordNotation) setNotation(change.chordNotation);
    if (change.capoDisplayMode) setCapoDisplay(change.capoDisplayMode);
    setError(null);
    apiClient.updateMe(change).catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }

  const hiddenCount = preferences.hiddenChordIds.length;
  const capoIsSuggestion = !view.arrangement?.document.defaults.capo && !!song.suggestedCapo;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("player.myView")}>
        <span className="mr-1 text-xs font-medium text-muted-foreground">{t("player.myView")}</span>
        <Toggle pressed={hiding} onClick={() => setHiding(!hiding)}>
          <EyeOff className="size-3.5" aria-hidden />
          {t("player.hideChords")}
        </Toggle>
        <Toggle pressed={preferences.simplifyChords} onClick={() => savePreferences({ ...preferences, simplifyChords: !preferences.simplifyChords })}>
          {t("player.simplify")}
        </Toggle>
        <Toggle pressed={preferences.hideBassNotes} onClick={() => savePreferences({ ...preferences, hideBassNotes: !preferences.hideBassNotes })}>
          {t("player.noBass")}
        </Toggle>
        <Toggle pressed={notation === "SOLFEGE"} onClick={() => saveSetting({ chordNotation: notation === "SOLFEGE" ? "LETTERS" : "SOLFEGE" })}>
          {t("player.solfege")}
        </Toggle>
        {chart.capo ? (
          <Toggle
            pressed={capoDisplay === "FINGERED"}
            onClick={() => saveSetting({ capoDisplayMode: capoDisplay === "FINGERED" ? "SOUNDING" : "FINGERED" })}
          >
            {t("player.capoShapes", { capo: chart.capo })}
          </Toggle>
        ) : null}
        <ChartColumnsPicker className="ml-auto" />
        {hiddenCount > 0 ? (
          <button
            type="button"
            className="text-xs text-primary hover:underline"
            onClick={() => savePreferences({ ...preferences, hiddenChordIds: [] })}
          >
            {t("player.showHidden", { count: hiddenCount })}
          </button>
        ) : null}
      </div>
      {chart.capo ? (
        <p className="text-xs text-muted-foreground" data-testid="capo">
          {capoIsSuggestion ? t("player.suggestedCapo", { capo: chart.capo }) : t("player.capo", { capo: chart.capo })}
          {" · "}
          {capoDisplay === "FINGERED" ? t("player.showingShapes") : t("player.showingSounding")}
        </p>
      ) : null}
      {hiding ? <p className="text-xs text-muted-foreground">{t("player.hideHint")}</p> : null}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <SongChart
        chart={chart}
        columns={columns}
        emptyText={t("sets.noChart")}
        onChordClick={hiding ? (id) => savePreferences({ ...preferences, hiddenChordIds: [...new Set([...preferences.hiddenChordIds, id])] }) : undefined}
      />
    </div>
  );
}

function Toggle({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 rounded-md border px-2 py-1 text-xs",
        pressed ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}
