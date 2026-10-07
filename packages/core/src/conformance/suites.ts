import { chordShapes, chordTones, shapeText } from "../chords/shapes.js";
import { diatonicChords, formatChord, keyUsesFlats, parseChord, sameChord, simplifyChord, transposeChord } from "../chords/chord.js";
import { formatKey, parseKey, semitonesBetween, transposeKey } from "../music-keys/transpose.js";
import { parseArrangementDocumentV2, findArrangementProblems } from "../schemas/arrangement-document-v2.js";
import { chordPositionProblem } from "../schemas/song-document-v2.js";
import { arrangementFromChart, mapChartIds, remapArrangement } from "../song-document/fold.js";
import { chartChords, chartSeconds, renderChart } from "../song-document/render.js";
import { structureOf } from "../song-document/structure.js";
import { flowToChordPro, lineToInlineText, readSongDocument, sectionsFromText, songDocumentFromSections, songDocumentFromText, songFromText, songToChordPro } from "../song-document/text.js";
import { sectionHeading } from "../chordpro/section-labels.js";
import { beatAt, clicksBetween, normalizeMetronome, tapTempo } from "../metronome/index.js";
import { clockOffset, deviceTime, metronomePositionAt, stemsPositionAt } from "../sync/index.js";
import { cuesFromSections } from "../recording/cues.js";
import { lyricSlides, normalizeScreenCode } from "../screens/index.js";
import { CreateSongVersionSchema, UpdateSongVersionSchema } from "../requests/songs.js";
import { AddSetlistItemSchema, CreateSetlistSchema } from "../requests/sets.js";
import { UpdateUserSchema } from "../requests/accounts.js";
import { checkRequest } from "../requests/messages.js";
import type { z } from "zod";

/**
 * The shared test cases (issue #170): what @songverse/core does, by area,
 * each function with the arguments it's tried with. The answers aren't
 * written here - they're this implementation's, written out by
 * `pnpm --filter @songverse/core conformance` to conformance/*.json, so a
 * change that alters one shows in the diff, for review. Add a case where
 * the behaviour matters to every client (the web app and the native apps,
 * #165): the song format, chords, the timeline, what the API accepts.
 */

export interface ConformanceFunction {
  about: string;
  params: string[];
  // The arguments come from JSON: each function reads its own.
  // oxlint-disable-next-line no-explicit-any
  run: (...args: any[]) => unknown;
  cases: { name: string; args: unknown[] }[];
}

export interface ConformanceArea {
  area: string;
  about: string;
  functions: Record<string, ConformanceFunction>;
}

// --- A song and an arrangement of it, the documents most cases use.

const SONG = {
  $schema: "song-document/v2",
  revision: 3,
  defaults: { key: "G", tempo: 72, timeSignature: { numerator: 4, denominator: 4 }, durationSeconds: 180 },
  sections: [
    {
      id: "sec_verse",
      type: "verse",
      label: null,
      showLabel: true,
      lines: [
        {
          id: "line_v1",
          kind: "lyric",
          text: "Amazing grace how sweet the sound",
          chords: [
            { id: "chd_v1", at: 0, raw: "G" },
            { id: "chd_v2", at: 18, raw: "G7" },
            { id: "chd_v3", at: 28, raw: "C" },
          ],
        },
        { id: "line_v2", kind: "note", text: "softly", chords: [] },
        {
          id: "line_v3",
          kind: "lyric",
          text: "That saved a wretch like me",
          chords: [
            { id: "chd_v4", at: 0, raw: "D/F#" },
            { id: "chd_v5", at: 20, raw: "Em7" },
          ],
        },
      ],
    },
    {
      id: "sec_chorus",
      type: "chorus",
      label: null,
      showLabel: true,
      lines: [
        {
          id: "line_c1",
          kind: "lyric",
          text: "I once was lost but now am found",
          chords: [
            { id: "chd_c1", at: 2, raw: "C" },
            { id: "chd_c2", at: 17, raw: "Dsus4" },
            { id: "chd_c3", at: 26, raw: "Bm7b5" },
          ],
        },
      ],
    },
  ],
  flow: [
    { id: "fi_verse", sectionId: "sec_verse" },
    { id: "fi_chorus", sectionId: "sec_chorus" },
    { id: "fi_chorus2", sectionId: "sec_chorus", label: "Chorus 2", keyChange: { steps: 2, key: "A" } },
  ],
};

const ARRANGEMENT = {
  $schema: "arrangement-document/v2",
  songVersionId: "song_1",
  songRevision: 3,
  defaults: { transposeSteps: -2, capo: 3 },
  items: [
    {
      id: "ai_1",
      sectionId: "sec_verse",
      overrides: [
        { type: "chord", chordId: "chd_v3", raw: "Cadd9" },
        { type: "hide_line", lineId: "line_v2" },
      ],
    },
    { id: "ai_2", sectionId: "sec_chorus", note: "all in", overrides: [{ type: "hide_chord", chordId: "chd_c3" }] },
    {
      id: "ai_3",
      sectionId: "sec_verse",
      label: "Verse 2",
      overrides: [
        { type: "lyric", lineId: "line_v1", text: "Twas grace that taught my heart to fear" },
        { type: "insert_line", afterLineId: "line_v3", line: { id: "ins_line_1", kind: "lyric", text: "Tag", chords: [{ id: "ins_chd_1", at: 0, raw: "G" }] } },
        { type: "chord", chordId: "chd_gone", raw: "A" },
      ],
    },
  ],
};

const read = (json: unknown) => readSongDocument(json);
const arrangement = (json: unknown) => parseArrangementDocumentV2(json);

/** A request body checked as the API checks it (checkRequest). */
const checked = (schema: z.ZodType) => (body: unknown) => checkRequest(schema, body);

export const CONFORMANCE: ConformanceArea[] = [
  {
    area: "keys",
    about: "Keys as written (\"G\", \"Bb\", \"F#m\"): read, written, moved by semitones.",
    functions: {
      parseKey: {
        about: "A key as written: its semitone from C and whether it's minor; null when it isn't one.",
        params: ["text"],
        run: parseKey,
        cases: ["C", "G", "Bb", "F#m", "Ebm", "Cb", "B#", "  a  ", "H", "", "Gmaj"].map((text) => ({ name: JSON.stringify(text), args: [text] })),
      },
      formatKey: {
        about: "A key from its semitone and mode, spelt as a key signature would.",
        params: ["key"],
        run: formatKey,
        cases: [
          ...[0, 1, 3, 6, 8, 10, 11].map((semitone) => ({ name: `major ${semitone}`, args: [{ semitone, minor: false }] })),
          ...[1, 3, 6, 10].map((semitone) => ({ name: `minor ${semitone}`, args: [{ semitone, minor: true }] })),
        ],
      },
      transposeKey: {
        about: "A key moved by semitones (negative goes down); null when it isn't a key.",
        params: ["key", "steps"],
        run: transposeKey,
        cases: [
          ["G", 2],
          ["G", -2],
          ["F", 1],
          ["Bb", 5],
          ["Em", 3],
          ["C#m", -1],
          ["E", 12],
          ["E", -13],
          ["nope", 1],
        ].map((args) => ({ name: args.join(" by "), args })),
      },
      semitonesBetween: {
        about: "The shortest way from one key to another, -5 to +6; null when either isn't a key.",
        params: ["from", "to"],
        run: semitonesBetween,
        cases: [
          ["G", "A"],
          ["A", "G"],
          ["C", "F#"],
          ["C", "G"],
          ["Em", "Gm"],
          ["G", "?"],
        ].map((args) => ({ name: args.join(" to "), args })),
      },
    },
  },
  {
    area: "chords",
    about: "Chord symbols as written: read, transposed (sharps or flats from the key), simplified, named in letters or solfège.",
    functions: {
      parseChord: {
        about: "A chord symbol read: its root, quality, seventh, extensions, alterations and bass; \"N.C.\" is no chord; null when it isn't a chord.",
        params: ["raw"],
        run: parseChord,
        cases: ["G", "Em7", "D/F#", "Cmaj7", "Bbm7b5", "F#dim7", "Gsus4", "Asus2", "C5", "Eaug", "C7#9", "Cadd9", "G6/B", "(Am)", "N.C.", "Hm", "verse", "",
          // As French books write them (issue #203).
          "G7maj", "C7M", "F#d", "C#7d", "A4", "Am4", "Asus", "Esus7", "F9/6", "C/9", "Ab+", "Bb9maj", "Bm7/5"].map((raw) => ({
          name: JSON.stringify(raw),
          args: [raw],
        })),
      },
      chordTones: {
        about: "A chord's notes, each with its interval above the root, its pitch class (C = 0), its role and whether a shape may leave it out; null when it isn't a chord.",
        params: ["chord"],
        run: chordTones,
        cases: ["C", "Am7", "G7", "Bm7b5", "Cmaj9", "A13", "Dsus4", "E7#9", "C/E", "D/C", "F#dim7", "C5", "N.C."].map((chord) => ({ name: JSON.stringify(chord), args: [chord] })),
      },
      chordShapes: {
        about:
          "Shapes for a chord on a guitar (EADGBE) or a ukulele (GCEA, high G), easiest and most usual first (issue #207): per string the fret (0 open, null muted), the fingers, barres, the fret the diagram starts at and the MIDI notes it sounds. Every needed note and nothing else; on a guitar the bass is lowest; at most four fingers, a barre counting as one. Each client draws them its own way (docs/chord-diagrams.md).",
        params: ["chord", "instrument", "limit"],
        run: chordShapes,
        cases: [
          ...["C", "G", "D", "Em", "F", "Bm", "B7", "Cmaj7", "Asus4", "D/F#", "Ab", "C#m", "A13", "E7#9", "C5"].map((chord) => ({ name: `guitar ${chord}`, args: [chord, "guitar", 3] })),
          ...["C", "F", "G", "Am", "E", "Bb", "Bm7", "D7"].map((chord) => ({ name: `ukulele ${chord}`, args: [chord, "ukulele", 3] })),
          { name: "not a chord", args: ["N.C.", "guitar", 3] },
        ],
      },
      shapeText: {
        about: "A shape written as players write it: \"x32010\", a fret past 9 in parentheses.",
        params: ["shape"],
        run: shapeText,
        cases: [
          { name: "open C", args: [{ frets: [null, 3, 2, 0, 1, 0] }] },
          { name: "high up", args: [{ frets: [null, 10, 12, 12, 12, 10] }] },
        ],
      },
      transposeChord: {
        about: "A chord moved by semitones, spelt with sharps or flats as the target key uses; anything that isn't a chord is left as written.",
        params: ["raw", "steps", "targetKey"],
        run: transposeChord,
        cases: [
          ["G", 2, "A"],
          ["D/F#", 2, "A"],
          ["Em7", 1, "F"],
          ["Bb", 1, null],
          ["C", -1, "B"],
          ["C", 1, "Db"],
          ["F#m7b5", -2, "E"],
          ["N.C.", 3, "C"],
          // A key written with a sharp keeps sharps (a guitarist's capo 3 shapes in A).
          ["A", -3, "F#"],
          ["E", -3, "C#"],
          ["(Am)", 5, "D"],
          ["verse", 2, "A"],
          ["G", 0, "G"],
          ["G", 12, "G"],
        ].map((args) => ({ name: `${args[0]} by ${args[1]} to ${args[2]}`, args })),
      },
      keyUsesFlats: {
        about: "Whether chords in this key are spelt with flats.",
        params: ["key"],
        run: keyUsesFlats,
        cases: ["F", "Bb", "Eb", "Dm", "Gm", "G", "D", "Em", "C", "Am", "F#", "C#", "C#m", "Gb", "Db", "Ebm", null].map((key) => ({ name: String(key), args: [key] })),
      },
      formatChord: {
        about: "A chord named in letters (\"english\", as written) or solfège (\"solfege\": Do, Ré, Mi…).",
        params: ["raw", "notation"],
        run: formatChord,
        cases: ["G", "Em7", "D/F#", "Bbmaj7", "C#m", "N.C."].flatMap((raw) => [
          { name: `${raw} in solfège`, args: [raw, "solfege"] },
          { name: `${raw} in letters`, args: [raw, "english"] },
        ]),
      },
      simplifyChord: {
        about: "A chord made easier: only its triad (dropExtensions), without its bass note (dropBass).",
        params: ["raw", "options"],
        run: simplifyChord,
        cases: [
          ["Gmaj7", { dropExtensions: true }],
          ["Em7", { dropExtensions: true }],
          ["Bm7b5", { dropExtensions: true }],
          ["Csus4", { dropExtensions: true }],
          ["Cadd9", { dropExtensions: true }],
          ["D/F#", { dropBass: true }],
          ["Am7/G", { dropExtensions: true, dropBass: true }],
          ["G", {}],
        ].map((args) => ({ name: `${args[0]} ${JSON.stringify(args[1])}`, args })),
      },
      sameChord: {
        about: "Whether two symbols are the same chord, however written.",
        params: ["a", "b"],
        run: sameChord,
        cases: [
          ["G", "G"],
          ["Gmaj", "G"],
          ["F#", "Gb"],
          ["Em7", "Emin7"],
          ["G", "G/B"],
          ["C", "Cm"],
        ].map((args) => ({ name: args.join(" and "), args })),
      },
      diatonicChords: {
        about: "The chords of a key, I to vii, for the chord palette.",
        params: ["key"],
        run: diatonicChords,
        cases: ["G", "F", "Em", "Bb", null].map((key) => ({ name: String(key), args: [key] })),
      },
    },
  },
  {
    area: "song-document",
    about: "SongDocument v2 (docs/song-document-v2.md): reading a stored one, and a song after its text or sections were edited - IDs kept for what's still there, the revision moved on.",
    functions: {
      readSongDocument: {
        about: "A stored song document, checked and with its defaults filled in; anything else fails.",
        params: ["json"],
        run: read,
        cases: [
          { name: "a song", args: [SONG] },
          {
            name: "lines and sections with what's left out filled in",
            args: [{ $schema: "song-document/v2", revision: 1, defaults: {}, sections: [{ id: "sec_a", type: "verse", lines: [{ id: "line_a", text: "Hello" }] }], flow: [] }],
          },
          { name: "not v2", args: [{ $schema: "song-document/v1", sections: [] }] },
          { name: "nothing", args: [null] },
          {
            name: "a chord past the end of its line",
            args: [{ ...SONG, sections: [{ id: "sec_a", type: "verse", lines: [{ id: "line_a", kind: "lyric", text: "Hi", chords: [{ id: "chd_a", at: 5, raw: "G" }] }] }], flow: [] }],
          },
          {
            name: "a note with a chord",
            args: [{ ...SONG, sections: [{ id: "sec_a", type: "verse", lines: [{ id: "line_a", kind: "note", text: "x2", chords: [{ id: "chd_a", at: 0, raw: "G" }] }] }], flow: [] }],
          },
          { name: "a section type that doesn't exist", args: [{ ...SONG, sections: [{ id: "sec_a", type: "solo-ish", lines: [] }], flow: [] }] },
        ],
      },
      chordPositionProblem: {
        about: "Why a line's chords can't be where they are (past its end, inside a character, out of order), or null.",
        params: ["text", "chords"],
        run: chordPositionProblem,
        cases: [
          { name: "fine", args: ["Amazing grace", [{ at: 0 }, { at: 8 }, { at: 13 }]] },
          { name: "past the end", args: ["Hi", [{ at: 3 }]] },
          { name: "out of order", args: ["Amazing", [{ at: 4 }, { at: 2 }]] },
          { name: "inside an emoji (UTF-16)", args: ["a🎵b", [{ at: 2 }]] },
          { name: "after an emoji", args: ["a🎵b", [{ at: 3 }]] },
        ],
      },
      songDocumentFromText: {
        about:
          "The song after its content was edited as text (CHORDPRO, CHORDS_OVER_LYRICS or RAW_TEXT): IDs kept from the previous song where the content is still there, new ones made for the rest (\"sec_@1\"), the revision moved on.",
        params: ["previous", "change"],
        run: (previous: unknown, change: Parameters<typeof songDocumentFromText>[1]) => songDocumentFromText(previous ? read(previous) : null, change),
        cases: [
          { name: "a new song from ChordPro", args: [null, { content: "{start_of_verse}\n[G]Amazing [C]grace\n{end_of_verse}\n{start_of_chorus}\n[D]I once was lost\n{end_of_chorus}\n{chorus}\n", format: "CHORDPRO", defaults: { key: "G" } }] },
          { name: "chords over lyrics", args: [null, { content: "[Verse]\nG       C\nAmazing grace\n\n[Chorus]\nD\nI once was lost\n", format: "CHORDS_OVER_LYRICS" }] },
          { name: "plain lyrics", args: [null, { content: "Amazing grace\nhow sweet the sound\n\nI once was lost\n", format: "RAW_TEXT" }] },
          {
            name: "one chord changed: every ID kept",
            args: [SONG, { content: "{start_of_verse}\n[G]Amazing grace how [G7]sweet the [Cadd9]sound\n{comment: softly}\n[D/F#]That saved a wretch [Em7]like me\n{end_of_verse}\n{start_of_chorus}\nI [C]once was lost but [Dsus4]now am [Bm7b5]found\n{end_of_chorus}\n", format: "CHORDPRO" }],
          },
          {
            name: "a line added to the chorus",
            args: [SONG, { content: "{start_of_verse}\n[G]Amazing grace how [G7]sweet the [C]sound\n{comment: softly}\n[D/F#]That saved a wretch [Em7]like me\n{end_of_verse}\n{start_of_chorus}\nI [C]once was lost but [Dsus4]now am [Bm7b5]found\nWas [G]blind but now I see\n{end_of_chorus}\n", format: "CHORDPRO" }],
          },
          { name: "only the key changed", args: [SONG, { format: "CHORDPRO", defaults: { key: "A" } }] },
        ],
      },
      songDocumentFromSections: {
        about: "The song after the structured editor changed its sections or flow: taken as they are, the flow following the sections when not given, the revision moved on.",
        params: ["previous", "change"],
        run: (previous: unknown, change: Parameters<typeof songDocumentFromSections>[1]) => songDocumentFromSections(previous ? read(previous) : null, change),
        cases: [
          { name: "the chorus dropped: the flow follows", args: [SONG, { sections: [SONG.sections[0]] }] },
          { name: "a new flow", args: [SONG, { flow: [{ id: "fi_chorus", sectionId: "sec_chorus" }, { id: "fi_verse", sectionId: "sec_verse" }] }] },
        ],
      },
      lineToInlineText: {
        about: "A line with its chords inline, as ChordPro writes it.",
        params: ["line"],
        run: lineToInlineText,
        cases: [
          { name: "a lyric", args: [SONG.sections[0]!.lines[0]] },
          { name: "a note", args: [SONG.sections[0]!.lines[1]] },
          { name: "chords only", args: [{ id: "line_x", kind: "lyric", text: "", chords: [{ id: "chd_x", at: 0, raw: "G" }, { id: "chd_y", at: 0, raw: "C" }] }] },
        ],
      },
    },
  },
  {
    area: "chordpro",
    about: "ChordPro and the other text formats, only for import and export: songs aren't stored that way.",
    functions: {
      sectionsFromText: {
        about: "Pasted or typed text as sections, with new IDs.",
        params: ["text", "format"],
        run: sectionsFromText,
        cases: [
          { name: "ChordPro with a comment and a label", args: ["{start_of_verse: Verse 2}\n[Am]Hello [F]world\n{comment: x2}\n{end_of_verse}\n{soc}\n[C]La la\n{eoc}\n", "CHORDPRO"] },
          { name: "ChordPro's short directives", args: ["{sov}\n[G]One\n{eov}\n{sob}\n[D]Two\n{eob}\n", "CHORDPRO"] },
          { name: "chords over lyrics, chords above the right letters", args: ["Verse 1:\n  G        D/F#   Em\nAmazing grace how sweet\n\nChorus:\nC      G\nI once was lost\n", "CHORDS_OVER_LYRICS"] },
          { name: "a line of chords only", args: ["[Intro]\nG  D  Em  C\n", "CHORDS_OVER_LYRICS"] },
          { name: "plain lyrics: a section per paragraph", args: ["One\nTwo\n\nThree\n", "RAW_TEXT"] },
          { name: "labels in other languages", args: ["Strophe 1\n[G]Un\n\nRefrain\n[C]Deux\n\nPuente:\n[D]Tres\n", "CHORDS_OVER_LYRICS"] },
        ],
      },
      songFromText: {
        about:
          "A file imported (mergeRepeats: a section written out again is sung again, not kept twice): its sections, the order they're sung in, the key it starts in, and a copyright line before the first section. A comment naming a section (\"Strophe 2\", \"Refrain\", \"Pont\") sets the type and label of the one after it, and a \"2. \" numbering its first line is dropped; the site's address and a comment saying the key changes are left out.",
        params: ["text", "format", "options"],
        run: songFromText,
        cases: [
          {
            name: "a songbook's file",
            args: [
              "{t: Christ a triomphé}\n{c: © 2020 Rolf Schneider}\n{c: https://www.example.org – 1143}\n{key: C}\n\n{c: Strophe 1}\n{start_of_verse}\n1. Des [C]ténèbres il s'est levé,\n{end_of_verse}\n\n{c: Refrain}\n{start_of_chorus}\nOh ! [F]mort\n{end_of_chorus}\n\n{c: Pont}\n{start_of_verse}\n[Am]Sur son corps\n{end_of_verse}\n\n{c: Strophe 2}\n{start_of_verse}\n2. Après [C]la peur\n{end_of_verse}\n\n{c: Refrain}\n{start_of_chorus}\nOh ! [F]mort\n{end_of_chorus}\n\n{key: D}\n{c: Changement de tonalité : D}\n\n{c: Fin}\n{start_of_chorus}\nOh ! [G]mort\n{end_of_chorus}\n",
              "CHORDPRO",
              { mergeRepeats: true },
            ],
          },
          { name: "a note before a section stays its note", args: ["{c: Softly}\n{start_of_verse}\n[G]One\n{end_of_verse}\n", "CHORDPRO", {}] },
          { name: "without mergeRepeats, a section written twice stays twice", args: ["{soc}\n[C]La\n{eoc}\n{soc}\n[C]La\n{eoc}\n", "CHORDPRO", {}] },
        ],
      },
      sectionHeading: {
        about: "Whether a line only names a section, in the languages songs come in: its type and its number or letter.",
        params: ["text"],
        run: sectionHeading,
        cases: ["Verse 2", "[Chorus]", "Bridge:", "Strophe 2a", "Refrain", "Pont b", "Pré-refrain", "Coro", "Estribillo 2", "Fin", "Introduction", "Amazing grace", "Allemand.1"].map((text) => ({
          name: JSON.stringify(text),
          args: [text],
        })),
      },
      songToChordPro: {
        about: "A song as a ChordPro file, with its details.",
        params: ["song", "details"],
        run: (song: unknown, details: Parameters<typeof songToChordPro>[1]) => songToChordPro(read(song), details),
        cases: [
          { name: "with its details", args: [SONG, { title: "Amazing Grace", artists: ["John Newton"], composers: ["Traditional"], capo: 2, ccli: "4755360", year: 1779, copyright: "Public domain" }] },
          { name: "a title only", args: [SONG, { title: "Amazing Grace" }] },
        ],
      },
      flowToChordPro: {
        about: "The order a song is sung in, as ChordPro: a section again is a reference to it.",
        params: ["song"],
        run: (song: unknown) => flowToChordPro(read(song)),
        cases: [{ name: "verse, chorus, chorus", args: [SONG] }],
      },
    },
  },
  {
    area: "chart",
    about:
      "A song played as its arrangement says, seen through a reader's choices: what every client shows. Transposition, capo shapes, solfège, simpler chords, the arrangement's changes; references the song no longer has are kept as problems, never dropped.",
    functions: {
      renderChart: {
        about:
          "The chart: each pass of the flow (or of the arrangement) with its lines and chords - each shown (label), as it sounds and as a guitarist frets it with the capo (for chord diagrams) - its key and whether the arrangement changes it.",
        params: ["song", "arrangement", "view"],
        run: (song: unknown, arr: unknown, view: Parameters<typeof renderChart>[2]) => renderChart(read(song), arr ? arrangement(arr) : null, view),
        cases: [
          { name: "as written", args: [SONG, null, {}] },
          { name: "a set's own transposition, in solfège", args: [SONG, null, { transposeSteps: 3, notation: "solfege" }] },
          { name: "the song's capo suggestion, as shapes", args: [SONG, null, { suggestedCapo: 2, capoDisplay: "shapes" }] },
          { name: "simpler chords, no bass notes, a hidden chord", args: [SONG, null, { preferences: { simplifyChords: true, hideBassNotes: true, hiddenChordIds: ["chd_v2"] } }] },
          { name: "an arrangement", args: [SONG, ARRANGEMENT, {}] },
          { name: "an arrangement with its capo, as shapes", args: [SONG, ARRANGEMENT, { capoDisplay: "shapes" }] },
        ],
      },
      chartChords: {
        about: "The chords a chart plays, each once, in the order they first come (a strip of chord diagrams): as a guitarist frets them with the capo, or as they sound.",
        params: ["song", "view", "as"],
        run: (song: unknown, view: Parameters<typeof renderChart>[2], as: "fretted" | "sounding") => chartChords(renderChart(read(song), null, view), as),
        cases: [
          { name: "as they sound", args: [SONG, {}, "sounding"] },
          { name: "fretted with the capo on 2", args: [SONG, { suggestedCapo: 2 }, "fretted"] },
        ],
      },
      structureOf: {
        about: "The structure bar: each pass's type, its number among those of its type, and its group.",
        params: ["song", "arrangement"],
        run: (song: unknown, arr: unknown) => structureOf(renderChart(read(song), arr ? arrangement(arr) : null)),
        cases: [
          { name: "the song's flow", args: [SONG, null] },
          { name: "an arrangement", args: [SONG, ARRANGEMENT] },
        ],
      },
      chartSeconds: {
        about: "How long the chart lasts, for autoscroll: the song's duration, or worked out from its tempo.",
        params: ["song", "durationSeconds"],
        run: (song: unknown, duration: number | null) => chartSeconds(renderChart(read(song)), duration),
        cases: [
          { name: "a duration given", args: [SONG, 200] },
          { name: "none given", args: [SONG, null] },
        ],
      },
    },
  },
  {
    area: "arrangements",
    about: "Arrangements following a song: checked against it, and pointed at another song's IDs when one song is folded into another (issue #75).",
    functions: {
      findArrangementProblems: {
        about: "What an arrangement refers to that the song doesn't have.",
        params: ["arrangement", "song"],
        run: (arr: unknown, song: unknown) => findArrangementProblems(arrangement(arr), read(song)),
        cases: [{ name: "a chord that's gone", args: [ARRANGEMENT, SONG] }],
      },
      mapChartIds: {
        about: "One song's section, line and chord IDs mapped to another's: the same ID where both have it, otherwise by content.",
        params: ["from", "to"],
        run: (from: unknown, to: unknown) => mapChartIds(read(from), read(to)),
        cases: [
          { name: "the same song", args: [SONG, SONG] },
          {
            name: "a copy with other IDs",
            args: [
              SONG,
              {
                ...SONG,
                sections: SONG.sections.map((section, s) => ({
                  ...section,
                  id: `sec_copy${s}`,
                  lines: section.lines.map((line, l) => ({ ...line, id: `line_copy${s}${l}`, chords: line.chords.map((chord, c) => ({ ...chord, id: `chd_copy${s}${l}${c}` })) })),
                })),
                flow: [],
              },
            ],
          },
        ],
      },
      remapArrangement: {
        about: "An arrangement pointed at another song through a map (as mapChartIds gives, its Maps as objects); what doesn't map is left, and songRevision 0 asks for a review.",
        params: ["arrangement", "map", "songVersionId"],
        run: (arr: unknown, map: Record<"sections" | "lines" | "chords", Record<string, string>>, songVersionId: string) =>
          remapArrangement(arrangement(arr), { sections: new Map(Object.entries(map.sections)), lines: new Map(Object.entries(map.lines)), chords: new Map(Object.entries(map.chords)) }, songVersionId),
        cases: [
          {
            name: "to a copy",
            args: [ARRANGEMENT, { sections: { sec_verse: "sec_copy0", sec_chorus: "sec_copy1" }, lines: { line_v1: "line_copy00", line_v2: "line_copy01", line_v3: "line_copy02" }, chords: { chd_v3: "chd_copy002", chd_c3: "chd_copy102" } }, "song_2"],
          },
        ],
      },
      arrangementFromChart: {
        about: "How one song is sung, as an arrangement of another (its owner's version, kept when folded): the key difference as transposeSteps, chords and lines changed as overrides, IDs mapped with mapChartIds; null when sung the same.",
        params: ["from", "to", "songVersionId"],
        run: (from: unknown, to: unknown, songVersionId: string) => {
          const a = read(from);
          const b = read(to);
          return arrangementFromChart(a, b, mapChartIds(a, b), songVersionId);
        },
        cases: [
          { name: "the same song", args: [SONG, SONG, "song_2"] },
          {
            name: "in A, with a chord changed",
            args: [
              {
                ...SONG,
                defaults: { ...SONG.defaults, key: "A" },
                sections: [
                  {
                    ...SONG.sections[0],
                    lines: [{ ...SONG.sections[0]!.lines[0], chords: [{ id: "chd_v1", at: 0, raw: "A" }, { id: "chd_v2", at: 18, raw: "A7" }, { id: "chd_v3", at: 28, raw: "Dmaj7" }] }, ...SONG.sections[0]!.lines.slice(1)],
                  },
                  SONG.sections[1],
                ],
              },
              SONG,
              "song_2",
            ],
          },
        ],
      },
    },
  },
  {
    area: "timeline",
    about:
      "The metronome and sync play's timeline (issue #13): only \"beat N at server time T\" crosses the network, and each device plays it on its own clock. Positions are in beats from the start, count-in included; times in ms.",
    functions: {
      clockOffset: {
        about: "The server's clock less the device's, from the ping with the shortest round trip; null with none usable.",
        params: ["samples"],
        run: clockOffset,
        cases: [
          { name: "the quickest of three", args: [[{ sent: 1000, at: 5060, received: 1100 }, { sent: 2000, at: 6015, received: 2020 }, { sent: 3000, at: 7090, received: 3200 }]] },
          { name: "a sample from the future is left out", args: [[{ sent: 1000, at: 5000, received: 900 }, { sent: 2000, at: 6010, received: 2020 }]] },
          { name: "none", args: [[]] },
        ],
      },
      deviceTime: {
        about: "A server time on this device's clock.",
        params: ["serverTime", "offset"],
        run: deviceTime,
        cases: [
          { name: "server ahead", args: [10_000, 4_000] },
          { name: "server behind", args: [10_000, -250.5] },
        ],
      },
      metronomePositionAt: {
        about: "Where the leader's metronome is at a server time: on from its anchor at the tempo while playing.",
        params: ["metronome", "serverTime"],
        run: metronomePositionAt,
        cases: [
          { name: "120 bpm, 1.5 s on", args: [{ settings: { tempo: 120 }, playing: true, anchorAt: 10_000, anchorPosition: 4 }, 11_500] },
          { name: "72 bpm, before its anchor", args: [{ settings: { tempo: 72 }, playing: true, anchorAt: 10_000, anchorPosition: 8 }, 9_000] },
          { name: "stopped", args: [{ settings: { tempo: 120 }, playing: false, anchorAt: 0, anchorPosition: 6 }, 99_999] },
        ],
      },
      stemsPositionAt: {
        about: "Seconds into the leader's recording at a server time: on from its anchor at its speed while playing, in the recording's own time.",
        params: ["stems", "serverTime"],
        run: stemsPositionAt,
        cases: [
          { name: "at full speed", args: [{ playing: true, position: 30, anchorAt: 10_000 }, 12_500] },
          { name: "at 80%", args: [{ playing: true, position: 30, anchorAt: 10_000, speed: 0.8 }, 12_500] },
          { name: "paused", args: [{ playing: false, position: 42.5, anchorAt: 0 }, 12_500] },
        ],
      },
      normalizeMetronome: {
        about: "Metronome settings made whole and within bounds: the tempo 20-300, a beat level per beat of the bar.",
        params: ["input"],
        run: normalizeMetronome,
        cases: [
          { name: "nothing", args: [null] },
          { name: "6/8", args: [{ tempo: 90, numerator: 6, denominator: 8 }] },
          { name: "too fast, beats missing", args: [{ tempo: 999, numerator: 3, beats: ["accent"] }] },
        ],
      },
      beatAt: {
        about: "The bar (negative in the count-in), beat and fraction at a position.",
        params: ["settings", "position"],
        run: beatAt,
        cases: [
          { name: "the start", args: [{ numerator: 4, countIn: 0 }, 0] },
          { name: "bar 2, beat 3 and a half", args: [{ numerator: 4, countIn: 0 }, 6.5] },
          { name: "in a bar of count-in", args: [{ numerator: 4, countIn: 1 }, 2] },
          { name: "after the count-in", args: [{ numerator: 3, countIn: 2 }, 7] },
        ],
      },
      clicksBetween: {
        about: "The clicks from one position (included) to another (not): accents, muted beats, subdivisions, count-in.",
        params: ["settings", "from", "to"],
        run: (settings: unknown, from: number, to: number) => clicksBetween(normalizeMetronome(settings as never), from, to),
        cases: [
          { name: "a bar of 4/4", args: [{ tempo: 100, numerator: 4 }, 0, 4] },
          { name: "eighths, a muted beat", args: [{ tempo: 100, numerator: 4, subdivision: 2, beats: ["accent", "mute", "normal", "normal"] }, 0, 2] },
          { name: "a bar of count-in, count-in only", args: [{ tempo: 100, numerator: 2, countIn: 1, countInOnly: true }, 0, 4] },
        ],
      },
      cuesFromSections: {
        about:
          "A recording's sections as an analyser labels them (issue #175), placed on the song's: each label on the next pass of that kind in the flow; one sung more often than written on the last of its kind placed; two choruses in a row two cues; labels it can't place left out.",
        params: ["found", "song"],
        run: (found: Parameters<typeof cuesFromSections>[0], song: unknown) => cuesFromSections(found, read(song)),
        cases: [
          {
            name: "verse, chorus, the chorus again",
            args: [[{ start: 0, label: "start" }, { start: 1.234, label: "verse" }, { start: 20, label: "chorus" }, { start: 35, label: "chorus" }, { start: 50, label: "chorus" }, { start: 60, label: "end" }], SONG],
          },
          { name: "labels in capitals, out of order, an instrumental the song hasn't", args: [[{ start: 30, label: "Chorus" }, { start: 2, label: "VERSE" }, { start: 15, label: "inst" }], SONG] },
          { name: "nothing it can place", args: [[{ start: 0, label: "start" }, { start: 5, label: "bridge" }], SONG] },
        ],
      },
      tapTempo: {
        about: "The tempo from taps (ms); null with too few.",
        params: ["taps"],
        run: tapTempo,
        cases: [
          { name: "steady at 120", args: [[0, 500, 1000, 1500, 2000]] },
          { name: "uneven", args: [[0, 480, 1010, 1490]] },
          { name: "one tap", args: [[0]] },
        ],
      },
    },
  },
  {
    area: "screens",
    about:
      "A set on a big screen (issue #186): the leader and each screen cut a song into the same slides, so only \"this song, slide N\" crosses the network; and the code a screen is paired by.",
    functions: {
      lyricSlides: {
        about: "A chart's sung lines, `size` at a time, pass by pass: no notes, no line without words; a pass without words is one empty slide.",
        params: ["song", "arrangement", "size"],
        run: (song: unknown, arr: unknown, size: number) => lyricSlides(renderChart(read(song), arr ? arrangement(arr) : null), size),
        cases: [
          { name: "two lines at a time, as written", args: [SONG, null, 2] },
          { name: "one at a time", args: [SONG, null, 1] },
          { name: "an arrangement: changed words, an inserted line", args: [SONG, ARRANGEMENT, 2] },
        ],
      },
      normalizeScreenCode: {
        about: "A pairing code as typed, as it's kept: upper case, no spaces or dashes; null when it can't be one.",
        params: ["input"],
        run: (input: string) => normalizeScreenCode(input),
        cases: [
          { name: "as shown", args: ["K7Q-M3X"] },
          { name: "typed in lower case with a space", args: ["k7q m3x"] },
          { name: "a letter it never uses (O)", args: ["K7Q-O3X"] },
          { name: "too short", args: ["K7QM"] },
        ],
      },
    },
  },
  {
    area: "requests",
    about:
      "What the API takes (issue #118), checked as it checks them (checkRequest): the body it goes on with (defaults filled in, text trimmed), or the messages it answers 400 with. A client can check a form the same way before sending it.",
    functions: {
      CreateSongVersionSchema: {
        about: "POST /song-versions",
        params: ["body"],
        run: checked(CreateSongVersionSchema),
        cases: [
          { name: "a title and language", args: [{ title: "  Amazing Grace ", language: "en", artists: ["John Newton"] }] },
          { name: "no title", args: [{ language: "en", artists: ["X"] }] },
          { name: "fields it doesn't know", args: [{ title: "X", language: "en", artists: ["X"], colour: "red", mood: "happy" }] },
          { name: "a year too early", args: [{ title: "X", language: "en", artists: ["X"], year: 999 }] },
          { name: "no artist", args: [{ title: "X", language: "en", artists: [] }] },
        ],
      },
      UpdateSongVersionSchema: {
        about: "PATCH /song-versions/:id: null or \"\" clears a field.",
        params: ["body"],
        run: checked(UpdateSongVersionSchema),
        cases: [
          { name: "clearing the album", args: [{ album: "" }] },
          { name: "a capo out of range", args: [{ capo: 14 }] },
        ],
      },
      CreateSetlistSchema: {
        about: "POST /setlists",
        params: ["body"],
        run: checked(CreateSetlistSchema),
        cases: [
          { name: "a name", args: [{ name: "Sunday" }] },
          { name: "no name: shown by its date", args: [{ eventDate: "2026-10-04" }] },
          { name: "a date that isn't one", args: [{ name: "Sunday", eventDate: "4/10/2026" }] },
        ],
      },
      AddSetlistItemSchema: {
        about: "POST /setlists/:id/items",
        params: ["body"],
        run: checked(AddSetlistItemSchema),
        cases: [
          { name: "a song", args: [{ songVersionId: "song_1" }] },
          { name: "nothing", args: [{}] },
        ],
      },
      UpdateUserSchema: {
        about: "PATCH /users/me",
        params: ["body"],
        run: checked(UpdateUserSchema),
        cases: [
          { name: "a language and instruments", args: [{ locale: "fr", instruments: ["DRUMS", "HARP"] }] },
          { name: "a language that isn't offered", args: [{ locale: "de" }] },
        ],
      },
    },
  },
];
