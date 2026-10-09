import {
  layoutChordLine,
  renderChart,
  type RenderedChart,
  type RenderedChord,
  type ChordFamily,
  type RenderedLine,
  type RenderedPass,
  type SectionInstance,
  type SectionV2,
} from "@songverse/core";
import { AlertTriangle } from "lucide-react";
import { Fragment, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import type { ChartColumns } from "#/lib/chart-columns";
import type { DisplayFontValue, DisplaySpacingValue } from "@songverse/core";
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
 * `onChordClick`, chords are buttons: a player hiding one for themselves,
 * or opening its diagram (`chordClickAction`, issue #207).
 */
export function SongChart({
  chart,
  emptyText,
  onChordClick,
  chordClickAction = "hide",
  colors = false,
  columns = "1",
  font = "mono",
  spacing = "normal",
  hideChords = false,
  chordScale = 1,
}: {
  chart: RenderedChart;
  emptyText?: string;
  /** The chord tapped: its ID (the same on every pass of its section), the element, and the chord as this pass shows it. */
  onChordClick?: (chordId: string, element: HTMLElement, chord: RenderedChord) => void;
  /** What tapping a chord does, for its label: hide it, or show its diagram. */
  chordClickAction?: "hide" | "diagram";
  /** Chords coloured by family (issues #9, #207): major, minor, sus, dim, aug, dominant 7th. */
  colors?: boolean;
  /** Flowed into columns on a wide screen (issue #177): as many as fit, or up to 2 or 3; a section never split. */
  columns?: ChartColumns;
  /** The player's Display settings (issue #209): the lettering, the space between lines, and lyrics only. */
  font?: DisplayFontValue;
  spacing?: DisplaySpacingValue;
  hideChords?: boolean;
  /** The chords' size against the lyrics' (issue #225): they stay over their letters at any size. */
  chordScale?: number;
}) {
  const { t } = useTranslation();
  if (chart.passes.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText ?? t("chart.empty")}</p>;
  }
  const labelFor = (pass: RenderedPass) =>
    pass.label ?? pass.section.label ?? (LABELLED_SECTIONS.has(pass.section.type) ? t(`chart.sections.${pass.section.type}`) : null);

  const flowed = columns !== "1";
  return (
    <div
      className={cn(
        "text-sm",
        font === "sans" ? "font-sans" : "font-mono",
        spacing === "compact" ? "leading-tight" : spacing === "relaxed" ? "leading-relaxed [&_[data-line]]:mb-1" : "leading-snug",
        // Chords named as capo shapes, not as they sound (issue #219): in italics, never mistaken for the sounding ones.
        chart.capoShapes && "[&_[data-chord]]:italic",
        flowed ? "gap-x-12 [column-rule:1px_solid_var(--color-border)] [&>[data-pass]]:mb-5 [&>[data-pass]]:break-inside-avoid" : "flex flex-col gap-5",
      )}
      // Auto: as many columns of at least 24rem as fit; 2 or 3: up to that many, never narrower than 18rem (a phone keeps one).
      style={{ ...(flowed && { columns: columns === "auto" ? "24rem" : `${columns} 18rem` }), ...(chordScale !== 1 && ({ "--chord-scale": chordScale } as CSSProperties)) }}
      data-chord-scale={chordScale}
      data-columns={columns}
      data-font={font}
      data-spacing={spacing}
      data-hide-chords={hideChords ? "" : undefined}
      data-capo-shapes={chart.capoShapes ? "" : undefined}
      data-testid="song-chart"
    >
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
                <ChartLine key={line.id} line={hideChords && line.kind !== "note" ? { ...line, chords: [] } : line} onChordClick={onChordClick} action={chordClickAction} colors={colors} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Each chord family's colour, readable in light and dark (Live): the scheme issue #9 proposed. */
const FAMILY_COLORS: Record<ChordFamily, string> = {
  major: "text-emerald-700 dark:text-emerald-400",
  minor: "text-blue-600 dark:text-sky-400",
  suspended: "text-amber-600 dark:text-yellow-300",
  diminished: "text-purple-600 dark:text-purple-400",
  augmented: "text-orange-600 dark:text-orange-400",
  dominant: "text-red-600 dark:text-red-400",
};

function ChartLine({
  line,
  onChordClick,
  action,
  colors,
}: {
  line: RenderedLine;
  onChordClick?: (chordId: string, element: HTMLElement, chord: RenderedChord) => void;
  action: "hide" | "diagram";
  colors: boolean;
}) {
  const { t } = useTranslation();
  const note = line.note ? <span className="ml-2 font-sans text-xs text-amber-700 italic dark:text-amber-400">{line.note}</span> : null;
  if (line.kind === "note") return <p className="font-sans text-xs text-muted-foreground italic">{line.text}</p>;
  if (line.chords.length === 0) {
    return (
      <p className={cn("whitespace-pre-wrap", line.inserted && "text-amber-800 dark:text-amber-300")} data-line="" data-line-id={line.id}>
        {line.text || " "}
        {note}
      </p>
    );
  }

  const replaced = new Set(line.chords.filter((chord) => chord.replaced).map((chord) => chord.id));
  const families = new Map(line.chords.map((chord) => [chord.id, chord.family]));
  const tint = (id: string | undefined) => {
    const family = id ? families.get(id) : null;
    return colors && family ? FAMILY_COLORS[family] : undefined;
  };
  const words = layoutChordLine(line.text, line.chords);
  return (
    <p data-line="" data-line-id={line.id} className={cn(line.inserted && "text-amber-800 dark:text-amber-300")}>
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
                <span key={c} className="inline-flex flex-col" style={width ? { minWidth: `calc(${width}ch * var(--chord-scale, 1))` } : undefined}>
                  <span className="font-bold text-primary [font-size:calc(1em*var(--chord-scale,1))]" data-chord={cell.chord ?? undefined}>
                    {cell.chords.length === 0
                      ? " "
                      : cell.chords.map((chord, k) => (
                          <Fragment key={chord.id ?? k}>
                            {k > 0 ? " " : null}
                            {onChordClick && chord.id ? (
                              <button
                                type="button"
                                className={cn("rounded-sm hover:bg-primary/10", replaced.has(chord.id) && "underline decoration-amber-500 decoration-2", tint(chord.id))}
                                data-chord-id={chord.id}
                                data-family={families.get(chord.id) ?? undefined}
                                aria-label={t(action === "hide" ? "chart.hideChord" : "chart.showDiagram", { chord: chord.label })}
                                onClick={(event) => onChordClick(chord.id!, event.currentTarget, line.chords.find((c) => c.id === chord.id)!)}
                              >
                                {chord.label}
                              </button>
                            ) : (
                              <span
                                className={cn(chord.id && replaced.has(chord.id) && "underline decoration-amber-500 decoration-2", tint(chord.id))}
                                data-family={(chord.id && families.get(chord.id)) || undefined}
                              >
                                {chord.label}
                              </span>
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
