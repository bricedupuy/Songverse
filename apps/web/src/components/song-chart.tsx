import type { SongDocument } from "@songverse/core";
import { useTranslation } from "react-i18next";

// Section types with a heading of their own; "other" has none.
const LABELLED_SECTIONS = new Set(["intro", "verse", "pre-chorus", "chorus", "post-chorus", "bridge", "instrumental", "outro", "tag"]);

/**
 * Read-only chord chart. Chords render inline immediately before the
 * lyric syllable they apply to (`[G]Amazing`), the same visual convention
 * as the ChordPro source text - simpler and more familiar to musicians
 * than a chord-above-lyric grid, and doesn't need monospace/column
 * alignment to stay legible.
 */
export function SongChart({ sections, emptyText }: { sections: SongDocument["sections"]; emptyText?: string }) {
  const { t } = useTranslation();
  if (sections.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText ?? t("chart.empty")}</p>;
  }
  const labelFor = (section: SongDocument["sections"][number]) =>
    section.label ?? (LABELLED_SECTIONS.has(section.type) ? t(`chart.sections.${section.type}`) : null);

  return (
    <div className="flex flex-col gap-5 font-mono text-sm leading-relaxed">
      {sections.map((section) => (
        <div key={section.id}>
          {labelFor(section) ? (
            <p className="mb-1 font-sans text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {labelFor(section)}
            </p>
          ) : null}
          {section.lines.map((line) => (
            <p key={line.id} className="whitespace-pre-wrap">
              {line.segments.length === 0
                ? " "
                : line.segments.map((segment) => (
                    <span key={segment.id}>
                      {segment.chord ? (
                        <span className="font-bold text-primary">[{segment.chord.raw}]</span>
                      ) : null}
                      {segment.lyric}
                    </span>
                  ))}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}
