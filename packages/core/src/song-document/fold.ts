import type { ArrangementDocumentV2, ArrangementItemV2, OverrideV2 } from "../schemas/arrangement-document-v2.js";
import type { LineV2, SectionV2, SongDocumentV2 } from "../schemas/song-document-v2.js";
import { transposeChord } from "../chords/chord.js";
import { parseKey } from "../music-keys/transpose.js";
import { reconcileSections } from "./reconcile.js";

/**
 * Folding one song into another (issue #75): a song published as a copy,
 * or submitted as a duplicate, becomes part of the catalogue song instead
 * of a second song. Its arrangements move over, and how it was written
 * becomes an arrangement of the catalogue song.
 */

/** Which of the other song's sections, lines and chords each of this song's is. */
export interface ChartIdMap {
  sections: Map<string, string>;
  lines: Map<string, string>;
  chords: Map<string, string>;
}

/**
 * Maps `from`'s IDs to `to`'s: the same ID where `to` has it (a copy keeps
 * its original's IDs, and edits keep the IDs of what they don't touch),
 * otherwise by content, as edited text is matched to the IDs it had
 * (reconcileSections). What has no counterpart isn't in the map.
 */
export function mapChartIds(from: Pick<SongDocumentV2, "sections">, to: Pick<SongDocumentV2, "sections">): ChartIdMap {
  const target = { sections: new Set<string>(), lines: new Set<string>(), chords: new Set<string>() };
  for (const section of to.sections) {
    target.sections.add(section.id);
    for (const line of section.lines) {
      target.lines.add(line.id);
      for (const chord of line.chords) target.chords.add(chord.id);
    }
  }
  const map: ChartIdMap = { sections: new Map(), lines: new Map(), chords: new Map() };
  const taken = { sections: new Set<string>(), lines: new Set<string>(), chords: new Set<string>() };
  const add = (kind: keyof ChartIdMap, fromId: string, toId: string) => {
    if (map[kind].has(fromId) || taken[kind].has(toId) || !target[kind].has(toId)) return;
    map[kind].set(fromId, toId);
    taken[kind].add(toId);
  };
  // The same IDs first, then what content matches.
  for (const section of from.sections) {
    add("sections", section.id, section.id);
    for (const line of section.lines) {
      add("lines", line.id, line.id);
      for (const chord of line.chords) add("chords", chord.id, chord.id);
    }
  }
  const matched = reconcileSections(to.sections, from.sections);
  from.sections.forEach((section, s) => {
    const other = matched[s]!;
    add("sections", section.id, other.id);
    section.lines.forEach((line, l) => {
      const otherLine = other.lines[l]!;
      add("lines", line.id, otherLine.id);
      line.chords.forEach((chord, c) => add("chords", chord.id, otherLine.chords[c]!.id));
    });
  });
  return map;
}

/**
 * The arrangement, pointing at the other song through `map`. What doesn't
 * map is left as it was, for its owner to review (findArrangementProblems);
 * `songRevision` 0 asks for that review.
 */
export function remapArrangement(arrangement: ArrangementDocumentV2, map: ChartIdMap, songVersionId: string): ArrangementDocumentV2 {
  const line = (id: string) => map.lines.get(id) ?? id;
  return {
    ...arrangement,
    songVersionId,
    songRevision: 0,
    items: arrangement.items.map((item) => {
      const inserted = new Set(item.overrides.flatMap((o) => (o.type === "insert_line" ? o.line.chords.map((c) => c.id) : [])));
      const chord = (id: string) => (inserted.has(id) ? id : (map.chords.get(id) ?? id));
      return {
        ...item,
        sectionId: map.sections.get(item.sectionId) ?? item.sectionId,
        ...(item.chords && { chords: item.chords.map((change) => ({ ...change, chordId: chord(change.chordId) })) }),
        ...(item.hiddenLines && { hiddenLines: item.hiddenLines.map(line) }),
        ...(item.lyrics && { lyrics: item.lyrics.map((change) => ({ ...change, lineId: line(change.lineId) })) }),
        overrides: item.overrides.map((override): OverrideV2 => {
          switch (override.type) {
            case "chord":
            case "hide_chord":
              return { ...override, chordId: chord(override.chordId) };
            case "hide_line":
            case "performance_note":
              return { ...override, lineId: line(override.lineId) };
            case "insert_line":
              return { ...override, afterLineId: override.afterLineId === null ? null : line(override.afterLineId) };
            case "lyric":
              return {
                ...override,
                lineId: line(override.lineId),
                ...(override.chordPositions && {
                  chordPositions: Object.fromEntries(Object.entries(override.chordPositions).map(([id, at]) => [chord(id), at])),
                }),
              };
          }
        }),
      };
    }),
  };
}

/** Semitones from one key up to another (-5 to +6); 0 if either isn't a key. */
function stepsBetween(from: string | null | undefined, to: string | null | undefined): number {
  const a = from ? parseKey(from) : null;
  const b = to ? parseKey(to) : null;
  if (!a || !b) return 0;
  const up = (((b.semitone - a.semitone) % 12) + 12) % 12;
  return up > 6 ? up - 12 : up;
}

/**
 * An arrangement of `to` that plays it as `from` is written (issue #75):
 * `from`'s passes, in its order and key; its lines where they differ -
 * lyrics and chords changed, lines left out or added (a section `to`
 * doesn't have goes in as lines added where it was). Null when `from` is
 * sung just as `to` is. Chords are written in `to`'s key, and
 * `transposeSteps` takes them to `from`'s.
 */
export function arrangementFromChart(
  from: Pick<SongDocumentV2, "sections" | "flow" | "defaults">,
  to: Pick<SongDocumentV2, "sections" | "flow" | "defaults" | "revision">,
  map: ChartIdMap,
  songVersionId: string,
  extra: { capo?: number | null; toCapo?: number | null } = {},
): ArrangementDocumentV2 | null {
  const steps = stepsBetween(to.defaults.key, from.defaults.key);
  const toKey = to.defaults.key ?? null;
  const toSections = new Map(to.sections.map((section) => [section.id, section]));
  const fromSections = new Map(from.sections.map((section) => [section.id, section]));
  // `from`'s chords written in `to`'s key.
  const inToKey = (line: LineV2): LineV2 => ({ ...line, chords: line.chords.map((chord) => ({ ...chord, raw: transposeChord(chord.raw, -steps, toKey) })) });

  let inserted = 0;
  const newLine = (line: LineV2): LineV2 => {
    const id = `ins_${++inserted}`;
    return { ...inToKey(line), id, chords: line.chords.map((chord, c) => ({ ...chord, id: `${id}_c${c}`, raw: transposeChord(chord.raw, -steps, toKey) })) };
  };

  /** The overrides that make `target` read as `source` does, and the last line it then shows. */
  function sectionOverrides(source: SectionV2, target: SectionV2, before: LineV2[]): { overrides: OverrideV2[]; last: string | null } {
    const overrides: OverrideV2[] = [];
    const targetIndex = new Map(target.lines.map((line, i) => [line.id, i]));
    const shown = new Set<string>();
    let anchor: string | null = null; // the last line shown so far
    for (const raw of before) {
      const added = newLine(raw);
      overrides.push({ type: "insert_line", afterLineId: anchor, line: added });
      anchor = added.id;
    }
    let next = 0; // the first target line not passed yet
    for (const raw of source.lines) {
      const line = inToKey(raw);
      const mappedId = map.lines.get(line.id);
      const at = mappedId === undefined ? undefined : targetIndex.get(mappedId);
      if (at === undefined || at < next) {
        const added = newLine(raw);
        overrides.push({ type: "insert_line", afterLineId: anchor, line: added });
        anchor = added.id;
        continue;
      }
      next = at + 1;
      const counterpart = target.lines[at]!;
      const chordsHere = line.chords.map((chord) => ({ id: map.chords.get(chord.id), at: chord.at, raw: chord.raw }));
      const allMapped = chordsHere.every((chord) => chord.id && counterpart.chords.some((c) => c.id === chord.id));
      if (line.kind !== counterpart.kind || !allMapped) {
        // Too different to adjust: shown as it's written instead.
        const added = newLine(raw);
        overrides.push({ type: "insert_line", afterLineId: anchor, line: added });
        anchor = added.id;
        continue;
      }
      shown.add(counterpart.id);
      const kept = counterpart.chords.filter((chord) => chordsHere.some((c) => c.id === chord.id));
      for (const chord of counterpart.chords) {
        if (!kept.includes(chord)) overrides.push({ type: "hide_chord", chordId: chord.id });
      }
      for (const chord of chordsHere) {
        const theirs = counterpart.chords.find((c) => c.id === chord.id)!;
        if (theirs.raw !== chord.raw) overrides.push({ type: "chord", chordId: theirs.id, raw: chord.raw });
      }
      const moved = chordsHere.filter((chord) => counterpart.chords.find((c) => c.id === chord.id)!.at !== chord.at);
      if (line.text !== counterpart.text || moved.length > 0) {
        overrides.push({
          type: "lyric",
          lineId: counterpart.id,
          text: line.text,
          ...(chordsHere.length > 0 && { chordPositions: Object.fromEntries(chordsHere.map((chord) => [chord.id!, chord.at])) }),
        });
      }
      anchor = counterpart.id;
    }
    for (const line of target.lines) if (!shown.has(line.id)) overrides.push({ type: "hide_line", lineId: line.id });
    return { overrides, last: anchor };
  }

  const items: ArrangementItemV2[] = [];
  let lastShown: string | null = null; // the last line the pass before shows
  let pending: LineV2[] = []; // lines of sections `to` doesn't have, for the next pass
  for (const pass of from.flow) {
    const source = fromSections.get(pass.sectionId);
    if (!source) continue;
    const targetId = map.sections.get(source.id);
    const target = targetId ? toSections.get(targetId) : undefined;
    if (!target) {
      // A section `to` doesn't have: its heading and lines, added to the pass before (or the next).
      const name = source.label ?? source.type.replace(/-/g, " ");
      const heading: LineV2 = { id: `hd_${source.id}`, kind: "note", text: name.charAt(0).toUpperCase() + name.slice(1), chords: [] };
      if (items.length > 0) {
        const last = items[items.length - 1]!;
        for (const raw of [heading, ...source.lines]) {
          const added = newLine(raw);
          last.overrides.push({ type: "insert_line", afterLineId: lastShown, line: added });
          lastShown = added.id;
        }
      } else {
        pending.push(heading, ...source.lines);
      }
      continue;
    }
    const { overrides, last } = sectionOverrides(source, target, pending);
    lastShown = last;
    pending = [];
    const { id, label, keyChange, tempo, timeSignature, note, transpose } = pass;
    // The pass's own chords and lines (issue #205), pointed at the other song's.
    const chords = pass.chords?.map((change) => ({ chordId: map.chords.get(change.chordId) ?? change.chordId, raw: change.raw === null ? null : transposeChord(change.raw, -steps, toKey) }));
    const hiddenLines = pass.hiddenLines?.map((lineId) => map.lines.get(lineId) ?? lineId);
    const lyrics = pass.lyrics?.map((change) => ({ ...change, lineId: map.lines.get(change.lineId) ?? change.lineId }));
    items.push({
      id,
      sectionId: target.id,
      label,
      keyChange,
      tempo,
      timeSignature,
      note,
      overrides,
      ...(transpose && { transpose }),
      ...(chords?.length && { chords }),
      ...(hiddenLines?.length && { hiddenLines }),
      ...(lyrics?.length && { lyrics }),
    });
  }

  const tempo = from.defaults.tempo !== to.defaults.tempo ? (from.defaults.tempo ?? null) : null;
  const timeSignature = JSON.stringify(from.defaults.timeSignature ?? null) !== JSON.stringify(to.defaults.timeSignature ?? null) ? (from.defaults.timeSignature ?? null) : null;
  const capo = extra.capo !== undefined && extra.capo !== extra.toCapo ? extra.capo : null;

  const plain =
    steps === 0 &&
    tempo === null &&
    timeSignature === null &&
    capo === null &&
    items.length === to.flow.length &&
    items.every((item, i) => {
      const pass = to.flow[i]!;
      return (
        item.overrides.length === 0 &&
        !item.transpose &&
        !item.chords?.length &&
        !item.hiddenLines?.length &&
        !item.lyrics?.length &&
        item.sectionId === pass.sectionId &&
        (item.label ?? null) === (pass.label ?? null) &&
        JSON.stringify(item.keyChange ?? null) === JSON.stringify(pass.keyChange ?? null) &&
        (item.note ?? null) === (pass.note ?? null)
      );
    });
  if (plain) return null;

  return {
    $schema: "arrangement-document/v2",
    songVersionId,
    songRevision: to.revision,
    defaults: {
      transposeSteps: steps,
      ...(tempo !== null && { tempo }),
      ...(timeSignature !== null && { timeSignature }),
      ...(capo !== null && { capo }),
    },
    items,
  };
}
