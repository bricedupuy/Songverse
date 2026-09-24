import { characterBoundaries, generateId, ID_PREFIXES, type LineV2, type SectionType, type SectionV2 } from "@songverse/core";
import type { JSONContent } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";

/**
 * The song's sections as the structured editor holds them, and back
 * (docs/song-document-v2.md, "Editor rules"): a section is a block, a line a
 * paragraph in it, and a chord an inline item sitting just before the
 * character it's pinned to. IDs travel both ways untouched.
 */

export function newSectionJSON(type: SectionType, lines: JSONContent[] = [newLineJSON()]): JSONContent {
  return { type: "section", attrs: { id: generateId(ID_PREFIXES.section), type, label: null, showLabel: true }, content: lines };
}

export function newLineJSON(): JSONContent {
  return { type: "line", attrs: { id: generateId(ID_PREFIXES.line), kind: "lyric" } };
}

function lineJSON(line: LineV2): JSONContent {
  const content: JSONContent[] = [];
  let cursor = 0;
  const text = (to: number) => {
    if (to > cursor) content.push({ type: "text", text: line.text.slice(cursor, to) });
    cursor = Math.max(cursor, to);
  };
  for (const chord of line.chords) {
    text(Math.min(chord.at, line.text.length));
    content.push({ type: "chord", attrs: { id: chord.id, raw: chord.raw } });
  }
  text(line.text.length);
  return { type: "line", attrs: { id: line.id, kind: line.kind }, ...(content.length > 0 && { content }) };
}

/** The editor's document for these sections; an empty song gets one empty verse to type into. */
export function sectionsToEditorJSON(sections: SectionV2[]): JSONContent {
  const content = sections.map(
    (section): JSONContent => ({
      type: "section",
      attrs: {
        id: section.id,
        type: section.type,
        label: section.label ?? null,
        showLabel: section.showLabel !== false,
        rhythm: section.rhythm ?? null,
        groove: section.groove ?? null,
      },
      content: section.lines.length > 0 ? section.lines.map(lineJSON) : [newLineJSON()],
    }),
  );
  return { type: "doc", content: content.length > 0 ? content : [newSectionJSON("verse")] };
}

function lineFromNode(node: PMNode): LineV2 {
  let text = "";
  const chords: LineV2["chords"] = [];
  node.forEach((child) => {
    if (child.isText) text += child.text;
    else if (child.type.name === "chord") chords.push({ id: child.attrs.id as string, raw: (child.attrs.raw as string).trim(), at: text.length });
  });
  // A chord typed inside a character written as several code units (an emoji, an accented letter) sits before it.
  const boundaries = characterBoundaries(text);
  for (const chord of chords) {
    while (!boundaries.has(chord.at)) chord.at--;
  }
  const kind = node.attrs.kind === "note" && chords.length === 0 ? "note" : "lyric";
  return { id: node.attrs.id as string, kind, text, chords };
}

const isBlank = (line: LineV2) => !line.text.trim() && line.chords.length === 0;

/**
 * The sections the editor holds. Empty lines at the end of a section (an
 * Enter too many) and sections with nothing in them are left out.
 */
export function editorToSections(doc: PMNode): SectionV2[] {
  const sections: SectionV2[] = [];
  doc.forEach((node) => {
    if (node.type.name !== "section") return;
    const lines: LineV2[] = [];
    node.forEach((child) => lines.push(lineFromNode(child)));
    while (lines.length > 0 && isBlank(lines.at(-1)!)) lines.pop();
    if (lines.length === 0 && !node.attrs.label) return;
    sections.push({
      id: node.attrs.id as string,
      type: node.attrs.type as SectionType,
      label: (node.attrs.label as string | null)?.trim() || null,
      showLabel: node.attrs.showLabel !== false,
      lines,
      rhythm: node.attrs.rhythm ?? null,
      groove: node.attrs.groove ?? null,
    });
  });
  return sections;
}

/** Sections in one canonical shape, so two copies of the same chart compare equal however they were built. */
export function sameSections(a: SectionV2[], b: SectionV2[]): boolean {
  const canonical = (sections: SectionV2[]) =>
    JSON.stringify(
      sections.map((section) => [
        section.id,
        section.type,
        section.label ?? null,
        section.showLabel !== false,
        section.rhythm ?? null,
        section.groove ?? null,
        section.lines.map((line) => [line.id, line.kind ?? "lyric", line.text, line.chords.map((chord) => [chord.id, chord.at, chord.raw])]),
      ]),
    );
  return canonical(a) === canonical(b);
}
