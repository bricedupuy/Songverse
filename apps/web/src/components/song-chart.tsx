import {
  layoutChordLine,
  renderChart,
  type RenderedChart,
  type RenderedLine,
  type RenderedPass,
  type SectionInstance,
  type SectionV2,
} from "@songverse/core";
import { AlertTriangle } from "lucide-react";
import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "#/lib/utils";

// Section types with a heading of their own; "other" has none.
const LABELLED_SECTIONS = new Set(["intro", "verse", "pre-chorus", "chorus", "post-chorus", "bridge", "vamp", "breakdown", "instrumental", "interlude", "outro", "tag"]);

/** A chart of sections as written (the song editor's preview, a review): no arrangement, no player's view. */
export function chartOfSections(sections: SectionV2[], flow: SectionInstance[] = [], key: string | null = null): RenderedChart {
  return renderChart({ $schema: "song-document/v2", revision: 0, defaults: { key }, sections, flow }, null);
}

/**
 * Read-only chord chart, drawn from renderChart() (so it's the song as the
 * arrangement plays it and this player reads it): chords above the
 * characters they're pinned to, spaced so chords close together never
 * overlap (see layoutChordLine and docs/song-document-v2.md, "Rendering
 * chords above lyrics"). Monospace, so a chord's width is its length in `ch`.
 *
 * Each pass shows its label, note and key change; one the arrangement
 * changes is marked, with its replaced chords and line notes. With
 * `onChordClick`, chords are buttons (a player hiding one for themselves).
 */
export function SongChart({
  chart,
  emptyText,
  onChordClick,
}: {
  chart: RenderedChart;
  emptyText?: string;
  onChordClick?: (chordId: string) => void;
}) {
  const { t } = useTranslation();
  if (chart.passes.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText ?? t("chart.empty")}</p>;
  }
  const labelFor = (pass: RenderedPass) =>
    pass.label ?? pass.section.label ?? (LABELLED_SECTIONS.has(pass.section.type) ? t(`chart.sections.${pass.section.type}`) : null);

  return (
    <div className="flex flex-col gap-5 font-mono text-sm leading-snug">
      {chart.passes.map((pass) => {
        const heading = pass.section.showLabel === false ? null : labelFor(pass);
        return (
          <div
            key={pass.id}
            data-section={pass.section.type}
            data-pass={pass.id}
            data-differs={pass.differs ? "" : undefined}
            className={cn(pass.differs && "-ml-3 border-l-2 border-amber-500/70 pl-2.5")}
          >
            {heading || pass.keyChange || pass.differs ? (
              <p className="mb-1 flex flex-wrap items-baseline gap-x-2 font-sans text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {heading ? <span>{heading}</span> : null}
                {pass.keyChange ? (
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary normal-case" data-key-change={pass.keyChange}>
                    {t("chart.keyChange", { key: pass.keyChange })}
                  </span>
                ) : null}
                {pass.differs ? <span className="font-normal text-amber-700 normal-case dark:text-amber-400">{t("chart.differs")}</span> : null}
              </p>
            ) : null}
            {pass.note ? <p className="mb-1 font-sans text-xs text-muted-foreground italic">{pass.note}</p> : null}
            {pass.problems.length > 0 ? (
              <p className="mb-1 flex items-center gap-1 font-sans text-xs text-destructive" role="note">
                <AlertTriangle className="size-3" aria-hidden />
                {t("chart.problems", { count: pass.problems.length })}
              </p>
            ) : null}
            <div className="flex flex-col gap-1">
              {pass.lines.map((line) => (
                <ChartLine key={line.id} line={line} onChordClick={onChordClick} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ChartLine({ line, onChordClick }: { line: RenderedLine; onChordClick?: (chordId: string) => void }) {
  const { t } = useTranslation();
  const note = line.note ? <span className="ml-2 font-sans text-xs text-amber-700 italic dark:text-amber-400">{line.note}</span> : null;
  if (line.kind === "note") return <p className="font-sans text-xs text-muted-foreground italic">{line.text}</p>;
  if (line.chords.length === 0) {
    return (
      <p className={cn("whitespace-pre-wrap", line.inserted && "text-amber-800 dark:text-amber-300")} data-line="">
        {line.text || " "}
        {note}
      </p>
    );
  }

  const replaced = new Set(line.chords.filter((chord) => chord.replaced).map((chord) => chord.id));
  const words = layoutChordLine(line.text, line.chords);
  return (
    <p data-line="" className={cn(line.inserted && "text-amber-800 dark:text-amber-300")}>
      {words.map((word, w) => (
        <Fragment key={w}>
          {/* A place the line may wrap, between words (never inside one). */}
          {w > 0 ? "​" : null}
          <span className="inline-flex whitespace-pre">
            {word.map((cell, c) => {
              // A chord wider than its text widens the cell, so the next chord stays over its own character.
              const width = cell.chord ? cell.chord.length + 1 : 0;
              const stretched = cell.midWord && width > cell.text.length;
              return (
                <span key={c} className="inline-flex flex-col" style={width ? { minWidth: `${width}ch` } : undefined}>
                  <span className="font-bold text-primary" data-chord={cell.chord ?? undefined}>
                    {cell.chords.length === 0
                      ? " "
                      : cell.chords.map((chord, k) => (
                          <Fragment key={chord.id ?? k}>
                            {k > 0 ? " " : null}
                            {onChordClick && chord.id ? (
                              <button
                                type="button"
                                className={cn("rounded-sm hover:bg-primary/10", replaced.has(chord.id) && "underline decoration-amber-500 decoration-2")}
                                data-chord-id={chord.id}
                                aria-label={t("chart.hideChord", { chord: chord.label })}
                                onClick={() => onChordClick(chord.id!)}
                              >
                                {chord.label}
                              </button>
                            ) : (
                              <span className={cn(chord.id && replaced.has(chord.id) && "underline decoration-amber-500 decoration-2")}>{chord.label}</span>
                            )}
                          </Fragment>
                        ))}
                  </span>
                  <span className="flex">
                    <span>{cell.text}</span>
                    {stretched ? (
                      <span aria-hidden className="flex-1 text-center text-muted-foreground">
                        -
                      </span>
                    ) : null}
                  </span>
                </span>
              );
            })}
          </span>
        </Fragment>
      ))}
      {note}
    </p>
  );
}
