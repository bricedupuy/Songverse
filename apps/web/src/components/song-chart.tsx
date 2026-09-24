import { layoutChordLine, transposeChord, transposeKey, type LineV2, type SectionInstance, type SectionV2 } from "@songverse/core";
import { Fragment } from "react";
import { useTranslation } from "react-i18next";

// Section types with a heading of their own; "other" has none.
const LABELLED_SECTIONS = new Set(["intro", "verse", "pre-chorus", "chorus", "post-chorus", "bridge", "instrumental", "outro", "tag"]);

/**
 * Read-only chord chart: chords above the characters they're pinned to,
 * spaced so chords close together never overlap (see layoutChordLine and
 * docs/song-document-v2.md, "Rendering chords above lyrics"). Monospace, so
 * a chord's width is its length in `ch`.
 *
 * `flow` shows the sections in the order they're sung (repeats and all),
 * with each pass's label, note and key change - chords after a key change
 * move with it; without it, each section once. `transposeSteps` moves
 * every chord, spelled for `targetKey`.
 */
export function SongChart({
  sections,
  flow,
  emptyText,
  transposeSteps = 0,
  targetKey,
}: {
  sections: SectionV2[];
  flow?: SectionInstance[];
  emptyText?: string;
  transposeSteps?: number;
  targetKey?: string | null;
}) {
  const { t } = useTranslation();
  if (sections.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText ?? t("chart.empty")}</p>;
  }
  const byId = new Map(sections.map((section) => [section.id, section]));
  // A key change holds from its pass on: its steps add to the chart's own.
  let shift = 0;
  let passKey: string | null = null;
  const passes = flow?.length
    ? flow.flatMap((item) => {
        const section = byId.get(item.sectionId);
        if (item.keyChange) {
          shift += item.keyChange.steps;
          passKey = transposeSteps ? (transposeKey(item.keyChange.key, transposeSteps) ?? item.keyChange.key) : item.keyChange.key;
        }
        return section
          ? [{ key: item.id, section, label: item.label ?? null, note: item.note ?? null, keyChange: item.keyChange ? passKey : null, steps: shift, spelling: passKey }]
          : [];
      })
    : sections.map((section) => ({ key: section.id, section, label: null, note: null, keyChange: null, steps: 0, spelling: null }));
  const labelFor = (section: SectionV2, override: string | null) =>
    override ?? section.label ?? (LABELLED_SECTIONS.has(section.type) ? t(`chart.sections.${section.type}`) : null);

  return (
    <div className="flex flex-col gap-5 font-mono text-sm leading-snug">
      {passes.map(({ key, section, label, note, keyChange, steps, spelling }) => {
        const heading = section.showLabel === false ? null : labelFor(section, label);
        const total = transposeSteps + steps;
        const chordLabel = (raw: string) => (total ? transposeChord(raw, total, spelling ?? targetKey) : raw);
        return (
          <div key={key} data-section={section.type} data-pass={key}>
            {heading || keyChange ? (
              <p className="mb-1 flex flex-wrap items-baseline gap-x-2 font-sans text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {heading ? <span>{heading}</span> : null}
                {keyChange ? (
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary normal-case" data-key-change={keyChange}>
                    {t("chart.keyChange", { key: keyChange })}
                  </span>
                ) : null}
              </p>
            ) : null}
            {note ? <p className="mb-1 font-sans text-xs text-muted-foreground italic">{note}</p> : null}
            <div className="flex flex-col gap-1">
              {section.lines.map((line) => (
                <ChartLine key={line.id} line={line} chordLabel={chordLabel} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ChartLine({ line, chordLabel }: { line: LineV2; chordLabel: (raw: string) => string }) {
  if (line.kind === "note") return <p className="font-sans text-xs text-muted-foreground italic">{line.text}</p>;
  if (line.chords.length === 0) return <p className="whitespace-pre-wrap">{line.text || " "}</p>;

  const words = layoutChordLine(
    line.text,
    line.chords.map((chord) => ({ at: chord.at, label: chordLabel(chord.raw) })),
  );
  return (
    <p data-line="">
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
                    {cell.chord ?? " "}
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
    </p>
  );
}
