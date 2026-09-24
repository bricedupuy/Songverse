import { parseKey } from "../music-keys/transpose.js";
import { sameChord, transposeChord } from "../chords/chord.js";
import type { ArrangementDocument, Override } from "./arrangement-document.js";
import type { Line, Segment } from "./shared.js";
import type { SongDocument, SongDocumentMetadata } from "./song-document.js";
import { parseSongDocumentV2, type ChordV2, type LineV2, type LyricAnchor, type SongDocumentV2 } from "./song-document-v2.js";
import { parseArrangementDocumentV2, type ArrangementDocumentV2, type OverrideV2 } from "./arrangement-document-v2.js";

/**
 * SongDocument / ArrangementDocument v1 -> v2. See docs/song-document-v2.md,
 * "Migrating from v1".
 *
 * Section, line and chord IDs are kept, so anything pointing at them still
 * resolves. v1's segments (lyrics cut at every chord) become one text per
 * line with the chords pinned to characters; references to a segment
 * become references to its line and character.
 */

export interface ConversionWarning {
  path: string;
  message: string;
}

export interface SongConversion {
  document: SongDocumentV2;
  /** v1's copy of the song's details. The SongVersion columns are the real ones; nothing here is migrated. */
  droppedMetadata: SongDocumentMetadata;
  /** v1's song-level capo, which belongs to an arrangement now. */
  capo: number | null;
  /** Where each v1 segment's text starts in v2 (and the chord it carried), for converting references. */
  segmentAnchors: Map<string, LyricAnchor & { chordId: string | null }>;
  warnings: ConversionWarning[];
}

export interface ConversionOptions {
  /**
   * Remove hyphens that break words into syllables ("Morn-ing", "be-" +
   * "fore" -> "Morning", "before"). v1 documents written by hand, like the
   * spec's examples, syllabify their lyrics; songs saved through the app
   * never do (ChordPro writes "be[D]fore"), so there a hyphen is part of
   * the words and this stays off.
   */
  stripSyllableHyphens?: boolean;
}

// A hyphen between two letters, or ending a segment whose next segment starts with a letter.
const SYLLABLE_HYPHEN = /(?<=\p{L})-(?=\p{L})/gu;

/** A v1 line's segments as one text, chords pinned where each segment began. */
function joinSegments(segments: Segment[], options: ConversionOptions): { text: string; chords: ChordV2[]; starts: number[] } {
  let text = "";
  const chords: ChordV2[] = [];
  const starts: number[] = [];
  segments.forEach((segment, index) => {
    let lyric = segment.lyric;
    if (options.stripSyllableHyphens) {
      lyric = lyric.replace(SYLLABLE_HYPHEN, "");
      const next = segments[index + 1];
      if (next && /\p{L}-$/u.test(lyric) && /^\p{L}/u.test(next.lyric)) lyric = lyric.slice(0, -1);
    }
    starts.push(text.length);
    if (segment.chord) chords.push({ id: segment.chord.id, at: text.length, raw: segment.chord.raw });
    text += lyric;
  });
  return { text, chords, starts };
}

function convertLine(line: Line, options: ConversionOptions): LineV2 {
  const { text, chords } = joinSegments(line.segments, options);
  return { id: line.id, kind: "lyric", text, chords };
}

/** Flow item IDs derive from the section's, so converting twice gives the same document. */
function flowItemId(sectionId: string): string {
  return `fi_${sectionId.replace(/^sec_/, "")}`;
}

export function songDocumentV1ToV2(v1: SongDocument, options: ConversionOptions & { revision?: number } = {}): SongConversion {
  const warnings: ConversionWarning[] = [];
  const segmentAnchors: SongConversion["segmentAnchors"] = new Map();
  const timeSignature = v1.defaults.timeSignature ?? null;

  const sections = v1.sections.map((section, s) => {
    const lines = section.lines.map((line) => {
      const { starts } = joinSegments(line.segments, options);
      line.segments.forEach((segment, i) =>
        segmentAnchors.set(segment.id, { lineId: line.id, at: starts[i]!, chordId: segment.chord?.id ?? null }),
      );
      return convertLine(line, options);
    });

    let rhythm: SongDocumentV2["sections"][number]["rhythm"] = null;
    if (section.rhythmMap) {
      const map = section.rhythmMap;
      const byIndex = new Map(map.measures.map((measure) => [measure.index, measure]));
      const barCount = Math.max(map.measureCount, ...map.measures.map((measure) => measure.index + 1));
      rhythm = {
        beatsPerBar: timeSignature && map.beatsPerMeasure === timeSignature.numerator ? null : map.beatsPerMeasure,
        bars: Array.from({ length: barCount }, (_, index) => {
          const measure = byIndex.get(index);
          const chords = (measure?.chordEvents ?? []).flatMap((event) => {
            const chordId = segmentAnchors.get(event.segmentId)?.chordId;
            if (chordId) return [{ chordId, beat: event.beat }];
            warnings.push({
              path: `sections[${s}].rhythmMap.measures[${index}]`,
              message: `Chord event on segment ${event.segmentId}, which has no chord - dropped`,
            });
            return [];
          });
          const anchor = measure?.lyricAnchor ? segmentAnchors.get(measure.lyricAnchor) : undefined;
          return {
            chords,
            lyricAnchor: anchor ? { lineId: anchor.lineId, at: anchor.at } : null,
            cue: measure?.cue ?? null,
          };
        }),
      };
    }

    return {
      id: section.id,
      type: section.type,
      label: section.label ?? null,
      showLabel: true,
      lines,
      rhythm,
      groove: section.groove ?? null,
    };
  });

  const document = parseSongDocumentV2({
    $schema: "song-document/v2",
    revision: options.revision ?? 1,
    defaults: {
      key: v1.defaults.key ?? null,
      tempo: v1.defaults.tempo ?? null,
      timeSignature,
      durationSeconds: v1.defaults.durationSeconds ?? null,
    },
    sections,
    // v1 has no order of its own: the sections, once each, as written.
    flow: v1.sections.map((section) => ({ id: flowItemId(section.id), sectionId: section.id })),
  });

  return { document, droppedMetadata: v1.metadata, capo: v1.defaults.capo ?? null, segmentAnchors, warnings };
}

export interface ArrangementConversion {
  document: ArrangementDocumentV2;
  warnings: ConversionWarning[];
}

/**
 * Converts an arrangement of `songV1`. v1 didn't say which key a chord
 * override was written in; this takes it as the key being played at that
 * point (the arrangement's transposition plus any key changes so far) -
 * which is what the Morning Light example does - and writes it back in the
 * song's key, as v2 requires. An override that then matches the song's
 * chord changes nothing and is dropped, with a warning.
 */
export function arrangementDocumentV1ToV2(
  v1: ArrangementDocument,
  songV1: SongDocument,
  options: ConversionOptions & { songRevision?: number } = {},
): ArrangementConversion {
  const warnings: ConversionWarning[] = [];
  const song = songDocumentV1ToV2(songV1, options);
  const songKey = songV1.defaults.key ?? null;
  const v1Lines = new Map(songV1.sections.flatMap((section) => section.lines.map((line) => [line.id, line] as const)));
  const v1Chords = new Map(
    songV1.sections.flatMap((section) =>
      section.lines.flatMap((line) => line.segments.flatMap((segment) => (segment.chord ? [[segment.chord.id, segment.chord.raw] as const] : []))),
    ),
  );

  const transposeSteps = v1.defaults.transposeSteps ?? stepsBetween(songKey, v1.defaults.key ?? null);
  if (v1.frozenAt) {
    warnings.push({ path: "frozenAt", message: `Was frozen at ${v1.frozenAt}: review it against the song` });
  }

  let keyOffset = transposeSteps;
  const items = v1.items.map((item, i) => {
    if (item.keyOverride) keyOffset += item.keyOverride.transposeSteps;
    const overrides: OverrideV2[] = [];
    const lyricEdits = new Map<string, Map<string, string>>();

    item.overrides.forEach((override: Override, o) => {
      const path = `items[${i}].overrides[${o}]`;
      switch (override.type) {
        case "chord": {
          const inSongKey = transposeChord(override.raw, -keyOffset, songKey);
          const original = v1Chords.get(override.chordId);
          if (original && sameChord(inSongKey, original)) {
            warnings.push({
              path,
              message: `Chord override ${override.chordId} -> ${override.raw} is the song's own ${original} in the key being played - dropped`,
            });
          } else {
            if (keyOffset !== 0) {
              warnings.push({ path, message: `Chord override ${override.raw} read as written ${keyOffset} semitones from the song's key: now ${inSongKey}` });
            }
            overrides.push({ type: "chord", chordId: override.chordId, raw: inSongKey });
          }
          break;
        }
        case "lyric": {
          const anchor = song.segmentAnchors.get(override.segmentId);
          if (!anchor) {
            warnings.push({ path, message: `Segment ${override.segmentId} not found - dropped` });
            break;
          }
          const edits = lyricEdits.get(anchor.lineId) ?? new Map<string, string>();
          edits.set(override.segmentId, override.value);
          lyricEdits.set(anchor.lineId, edits);
          break;
        }
        case "hide_line":
          overrides.push({ type: "hide_line", lineId: override.lineId });
          break;
        case "performance_note":
          overrides.push({ type: "performance_note", lineId: override.lineId, note: override.note });
          break;
        case "insert_line":
          overrides.push({ type: "insert_line", afterLineId: override.afterLineId ?? null, line: convertLine(override.line, options) });
          break;
      }
    });

    // Every segment replaced on one line becomes one lyric override for the line.
    for (const [lineId, edits] of lyricEdits) {
      const line = v1Lines.get(lineId)!;
      const before = joinSegments(line.segments, options);
      const after = joinSegments(
        line.segments.map((segment) => (edits.has(segment.id) ? { ...segment, lyric: edits.get(segment.id)! } : segment)),
        options,
      );
      const moved = Object.fromEntries(
        after.chords.filter((chord, c) => chord.at !== before.chords[c]!.at).map((chord) => [chord.id, chord.at]),
      );
      overrides.push({
        type: "lyric",
        lineId,
        text: after.text,
        ...(Object.keys(moved).length > 0 && { chordPositions: moved }),
      });
    }

    return {
      id: item.id,
      sectionId: item.sectionId,
      label: item.instanceLabel ?? null,
      keyChange: item.keyOverride ? { steps: item.keyOverride.transposeSteps, key: item.keyOverride.key } : null,
      note: item.performanceNote ?? null,
      durationSeconds: item.durationOverrideSeconds ?? null,
      overrides,
    };
  });

  const document = parseArrangementDocumentV2({
    $schema: "arrangement-document/v2",
    songVersionId: v1.songVersionId,
    songRevision: options.songRevision ?? song.document.revision,
    defaults: {
      transposeSteps,
      tempo: v1.defaults.tempo ?? null,
      timeSignature: v1.defaults.timeSignature ?? null,
      capo: v1.defaults.capo ?? null,
      guitarTuning: v1.defaults.guitarTuning ?? null,
      guitarTuningNotes: v1.defaults.guitarTuningNotes ?? null,
    },
    items,
  });
  return { document, warnings };
}

/** Semitones from one key to another, the shorter way (-5..+6); 0 when either is unknown. */
function stepsBetween(from: string | null, to: string | null): number {
  const a = from ? parseKey(from) : null;
  const b = to ? parseKey(to) : null;
  if (!a || !b) return 0;
  const up = (((b.semitone - a.semitone) % 12) + 12) % 12;
  return up > 6 ? up - 12 : up;
}
