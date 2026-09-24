# SongDocument v2

**Status:** implementation contract (schemas in `packages/core/src/schemas/song-document-v2.ts`)
**Replaces:** [SongDocument v1](song-document-v1.md)
**Example:** [`morning-light-song.v2.json`](../packages/core/src/__tests__/fixtures/morning-light-song.v2.json)

A song's music: its sections, lines, chords and timing, stored in
`SongVersion.documentJson`. The song editor edits it directly. ChordPro,
chords-over-lyrics, plain lyrics and LRC are only ways in (import, paste)
and out (export). None of them is how a song is stored.

## Status

| Part | State |
|---|---|
| Schemas, chord reader, v1→v2 converter, Morning Light examples | Done, in `@songverse/core`, with tests |
| Songs stored as v2 (migration of existing rows, saving with `revision`) | Next |
| Structured editor (the rules below) | After that |
| ChordPro `{comment}` / `{chorus}` import, exports from v2 | With the editor |

Stored songs are still v1 until the migration runs; this document is the
contract the next steps are built against.

## What changed from v1, and why

| v1 | v2 | Why |
|---|---|---|
| A line is a list of *segments*: lyric pieces cut at every chord | A line is one `text` with `chords` pinned to characters (`at`) | Moving a chord only changes `at`, and fixing lyrics is ordinary text editing. Chord and line IDs never change. Lyrics hold no hyphens. |
| `metadata` copies title, language, CCLI, copyright… | Removed | Those are `SongVersion` columns: one source of truth, nothing to drift |
| `chord.normalized` stored beside `raw` | Only `raw` is stored; `parseChord()` reads it | Nothing stale to rebuild when the chord reader improves |
| `defaults.keyNormalized`, `defaults.capo` | Removed | The key is read from `key`; the capo belongs to an arrangement |
| Sections in singing order, repeats written out again | `sections` hold each distinct section once; `flow` is the order they're sung in | Repeats without copies. Perform mode can run a song with no arrangement. |
| No way to say "×2" or "softly" | `kind: "note"` lines | ChordPro comments and cues have somewhere to go |
| Rhythm maps point at segments | Point at chords (`chordId`) and characters (`{ lineId, at }`) | Segments no longer exist |
| No version number | `revision` | Autosave conflicts and arrangement review |

## Top level

```jsonc
{
  "$schema": "song-document/v2",
  "revision": 12,
  "defaults": { "key": "G", "tempo": 72, "timeSignature": { "numerator": 3, "denominator": 4 }, "durationSeconds": 245 },
  "sections": [ /* Section */ ],
  "flow": [ /* SectionInstance */ ]
}
```

| Field | Description |
|---|---|
| `revision` | Goes up by one with every saved change (see [Saving](#saving)). |
| `defaults.key` | As written: `"G"`, `"Bb"`, `"F#m"`. `parseKey()` reads it. Chords are stored at concert pitch in this key. |
| `defaults.tempo` | BPM. |
| `defaults.timeSignature` | `{ numerator, denominator }`. |
| `defaults.durationSeconds` | For autoscroll and set lengths. |

What the song is called, who wrote it, its rights and identifiers are
`SongVersion` columns and never appear in the document. An export composes
both.

## Sections

```jsonc
{ "id": "sec_…", "type": "chorus", "label": null, "showLabel": true, "lines": [ … ], "rhythm": null, "groove": null }
```

| Field | Description |
|---|---|
| `type` | `intro` `verse` `pre-chorus` `chorus` `post-chorus` `bridge` `instrumental` `outro` `tag` `other` |
| `label` | Shown instead of the type's (translated) name, e.g. "Verse 2" or "Tag". `null` uses the type's name. |
| `showLabel` | `false` hides the heading on the chart; it's still a section for navigation. |
| `rhythm` | Optional bar-by-bar timing (see [Rhythm](#rhythm)). |
| `groove` | Optional drum groove (unchanged from v1). |

Each distinct section is stored **once**. A chorus sung three times is one
section that appears three times in `flow`. "Duplicate section" in the
editor makes a separate copy with new IDs, for when the words differ.

## Lines

```jsonc
{
  "id": "line_…",
  "kind": "lyric",
  "text": "Amazing grace how sweet the sound",
  "chords": [
    { "id": "chd_…", "at": 0,  "raw": "G" },
    { "id": "chd_…", "at": 13, "raw": "G7" },
    { "id": "chd_…", "at": 18, "raw": "C" }
  ]
}
```

`kind` is `"lyric"` (the default) or `"note"`. A note line ("×2", "softly",
"band re-enters") has text and no chords. A line of chords only (an intro,
say) is a lyric line with empty `text`, its chords all at `at: 0` in playing
order.

### Chords are pinned to characters

`at` is the index of the character the chord sits above, counted the way
JavaScript counts string positions (UTF-16 code units, as the editor
does). The rules, all checked by the schema:

- `0 ≤ at ≤ text.length`. `at === text.length` is a chord after the last
  word ("…see |D").
- Chords are listed in order along the line (`at` never decreases). Chords
  on the same character play in the order listed.
- `at` always falls on a character boundary: never inside an accented
  letter written as two code units (`e` + combining accent) or an emoji.

A chord in the middle of a word just has its `at` there: `before` with `D/F#`
at the `f`. The text never gets a hyphen. Where two chords would collide,
the renderer stretches the word or adds a hyphen when drawing it.

### Chord symbols

`raw` is the symbol exactly as written ("F#m7b5/C#", "Cadd9", "(G)",
"N.C."), and it's the only thing stored. `@songverse/core` reads it:

| Function | Use |
|---|---|
| `parseChord(raw)` | Root, quality, seventh, extensions, alterations, bass, optional. Returns `null` for anything it can't fully read; that chord is still shown as written. |
| `transposeChord(raw, steps, targetKey)` | Moves the root and bass, spelled for the key (B♭ in F, A♯ in B). The rest of the symbol is kept as the author wrote it. |
| `formatChord(raw, "solfege")` | "Sol/Si" for "G/B". Notation is a display preference, never stored. |
| `simplifyChord(raw, options)` | "G" for "Gmaj7", "D" for "D/F#": for players who hide complexity (see the arrangement spec's personal preferences). |
| `sameChord(a, b)` | Same sound however spelled ("A#m" and "Bbm"). |

Nashville numbers, diatonic suggestions in the chord picker and key
detection all build on `parseChord` and `defaults.key`.

## Flow: the order it's sung in

```jsonc
"flow": [
  { "id": "fi_v1", "sectionId": "sec_v1" },
  { "id": "fi_ch1", "sectionId": "sec_ch" },
  { "id": "fi_v2", "sectionId": "sec_v2" },
  { "id": "fi_ch2", "sectionId": "sec_ch", "label": "Chorus 2" },
  { "id": "fi_ch3", "sectionId": "sec_ch", "label": "Final chorus", "keyChange": { "steps": 1, "key": "Ab" }, "note": "Big" }
]
```

A `SectionInstance`: one pass through a section. An arrangement's `items`
use the same shape with overrides added, so one renderer and one
performance transport walk both, and a song with no arrangement can still
be performed.

| Field | Description |
|---|---|
| `sectionId` | The section sung. The same section can appear any number of times. |
| `label` | "Chorus 2"; `null` uses the section's label. |
| `keyChange` | From this pass on: `steps` semitones from the key in effect before it (authoritative), `key` as written for display. |
| `tempo`, `timeSignature` | From this pass on. |
| `note` | For the band. |

## Rhythm

An optional timing layer on a section; the lines stay the structure.

```jsonc
"rhythm": {
  "beatsPerBar": null,
  "bars": [
    { "chords": [{ "chordId": "chd_v1_01", "beat": 1 }], "lyricAnchor": { "lineId": "line_v1_01", "at": 0 }, "cue": null },
    { "chords": [], "lyricAnchor": null, "cue": "hold" }
  ]
}
```

- `beatsPerBar` defaults to the time signature's top number.
- A bar with no chord changes carries the previous chord on.
- `beat` is 1-based and may be fractional (2.5 is the "and" of 2).

## Anchors

Anything that points into the lyrics uses a **lyric anchor**,
`{ lineId, at }`: rhythm bars, performance notes, and later ink
annotations, live-sync positions and LRC timings. It survives edits the
same way chords do (see below).

## IDs

| Kind | Prefix |
|---|---|
| Section | `sec_` |
| Line | `line_` |
| Chord | `chd_` |
| Flow item | `fi_` |

IDs are created once and follow their content: they never change on save,
move with the content, and aren't reused after a delete. They're unique
across the whole document. Arrangements, notes, personal chart preferences
and (later) annotations all refer to them.

## Saving

- The editor sends the whole document along with the `revision` it
  started from. The server rejects the save if the stored revision is
  newer (another tab or another admin saved in between), so nothing is
  silently overwritten. Otherwise it stores the document with
  `revision + 1`.
- The document is validated with `SongDocumentV2Schema`, including the
  size limits in `SONG_DOCUMENT_LIMITS`.

## Editor rules

The editor is a structured editor built on ProseMirror/Tiptap:

- A section is a block, a line is a paragraph, and a chord is an inline
  item sitting before the character it's pinned to, carrying its `id` and
  `raw`.
- Saving converts that to this format. Loading converts it back.

**Moving a chord.** Drag it to another character, which is highlighted while
dragging. Or select it and use ← / → to move it one character at a time,
which also works for keyboard and screen-reader users. Long-press to drag
on a phone. Only `at` changes.

**Editing lyrics** is ordinary text editing. Chords stay with the characters
around them: typing before a chord moves it along, and typing after it
doesn't.

- **Deleting text that has chords on it** keeps the chords and gathers them
  at the point of the deletion, in their original order. Removing a chord is
  a separate, explicit action, so a lyric fix never loses chords.
- **Splitting a line** (Enter in the middle) moves the chords after the
  split to the new line, keeping their IDs. The new line gets a new line
  ID.
- **Joining two lines** keeps the first line's ID. The second line's chords
  move into it, keeping their IDs.

**Pasting** is detected with the import detector (`detectImportFormat`):

- Plain words paste as text.
- ChordPro, chords-over-lyrics and lyrics with section labels become lines
  and chords at the cursor. They become new sections when the paste contains
  section headings or blank-line-separated blocks.
- Pasted chords get new IDs.

**Text mode** (for developers and tricky fixes) shows a section as inline
text: `[G]Amazing grace how [G7]sweet the [C]sound`.

- Switching back parses it and keeps IDs by matching:
  - lines to their previous version by position, then by the most similar
    text;
  - chords within a matched line by order and symbol.
- Anything unmatched gets a new ID.

## Import and export

| Format | In | Out |
|---|---|---|
| ChordPro | `{start_of_x}` sections, `[C]` chords, `{comment}` → note line, `{chorus}` → the chorus again in `flow` | Sections, chords inline, notes as `{comment}`; title, key, tempo and CCLI from the columns plus `defaults` |
| Chords over lyrics | Chord columns pinned to the character below | The same layout |
| Plain lyrics | Blank lines and "Verse"/"Chorus" labels split sections | Lyrics only |
| LRC | Line timings as anchors (planned) | Planned |
| PDF, FreeShow, OpenLyrics | – | Planned; all from this document plus the columns |

## Migrating from v1

`songDocumentV1ToV2()` and `arrangementDocumentV1ToV2()` in `@songverse/core`,
covered by `song-document-v2.test.ts` against the Morning Light files:

- **Lines:** a line's segments are joined into one text, and each chord is
  pinned to the character where its segment started. Section, line and chord
  IDs are kept, so everything pointing at them still resolves. Segment IDs
  go.
- **Hyphens:** v1 documents written by hand (the spec examples, Morning
  Light) split words into syllables ("Morn-ing"). `stripSyllableHyphens`
  removes those hyphens. It stays **off** for songs saved through the app:
  the app's parsers never add syllable hyphens (ChordPro writes
  `be[D]fore`), so a hyphen there is part of the words.
- **Rhythm maps:** point at the segment's chord and at the character where
  the segment started.
- **Dropped:** `metadata` (returned as `droppedMetadata` for checking; the
  columns are the truth) and `keyNormalized`.
- **Capo:** a song-level capo is returned as `capo`, for the song's default
  arrangement.
- **Flow:** v1 has none, so `flow` lists the sections once each, as
  written. Flow item IDs derive from section IDs, so converting twice gives
  the same result.
- **Revision:** starts at 1.

## Planned extensions

These fit the model without changing what's above:

- a second language under each line (bilingual services);
- voice parts (lead, alto, tenor) on lines;
- syllable timing for singer practice;
- LRC anchors;
- real-time collaborative editing: the editor's ProseMirror model syncs
  through Yjs, and saves still write this document.
