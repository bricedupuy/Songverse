import type { SongDocument } from "@songverse/core";

const SECTION_LABELS: Record<string, string> = {
  intro: "Intro",
  verse: "Verse",
  "pre-chorus": "Pre-Chorus",
  chorus: "Chorus",
  "post-chorus": "Post-Chorus",
  bridge: "Bridge",
  instrumental: "Instrumental",
  outro: "Outro",
  tag: "Tag",
  other: "",
};

/**
 * Read-only chord chart. Chords render inline immediately before the
 * lyric syllable they apply to (`[G]Amazing`), the same visual convention
 * as the ChordPro source text - simpler and more familiar to musicians
 * than a chord-above-lyric grid, and doesn't need monospace/column
 * alignment to stay legible.
 */
export function SongChart({ sections }: { sections: SongDocument["sections"] }) {
  if (sections.length === 0) {
    return <p className="text-sm text-muted-foreground">No content yet — paste ChordPro text below to add some.</p>;
  }

  return (
    <div className="flex flex-col gap-5 font-mono text-sm leading-relaxed">
      {sections.map((section) => (
        <div key={section.id}>
          {(section.label ?? SECTION_LABELS[section.type]) ? (
            <p className="mb-1 font-sans text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {section.label ?? SECTION_LABELS[section.type]}
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
