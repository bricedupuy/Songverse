# ArrangementDocument v2

**Status:** implementation contract (schemas in `packages/core/src/schemas/arrangement-document-v2.ts`)
**Replaces:** [ArrangementDocument v1](arrangement-document-v1.md)
**Builds on:** [SongDocument v2](song-document-v2.md)
**Example:** [`morning-light-arrangement.v2.json`](../packages/core/src/__tests__/fixtures/morning-light-arrangement.v2.json)

How a band plays a song: the order of its sections, and what differs from
the song on each pass. It never copies the song's content. It points at the
song's sections, lines and chords by ID and records the differences.

## What changed from v1

| v1 | v2 | Why |
|---|---|---|
| Chord overrides didn't say which key they were written in | **Everything is written in the song's key** | v1's own example was ambiguous (below) |
| `key` and `transposeSteps` both set the arrangement's key | `transposeSteps` only; the key follows from it | One source of truth |
| `keyOverride` with `key`, `keyNormalized` and `transposeSteps` | `keyChange: { steps, key }`, shared with the song's `flow` | Same shape as the song |
| `lyric` override replaced a segment | Replaces a line's text; its chords keep their IDs | Segments are gone |
| – | `hide_chord` override | Leave a chord out for the whole band |
| `frozenAt` set when the song changed | `songRevision` | "Checked against revision 12; the song is at 15" says exactly what to review |
| `instanceLabel`, `performanceNote`, `durationOverrideSeconds` | `label`, `note`, `durationSeconds` | Same names as the song's flow |
| – | Personal chart preferences | A player's own view, which changes nothing for others |

## Top level

```jsonc
{
  "$schema": "arrangement-document/v2",
  "songVersionId": "…",
  "songRevision": 12,
  "defaults": { "transposeSteps": 2, "tempo": 80, "timeSignature": null, "capo": 2, "guitarTuning": null, "guitarTuningNotes": null },
  "items": [ /* ArrangementItem */ ]
}
```

| Field | Description |
|---|---|
| `songRevision` | The song revision this arrangement was last checked against. When the song is newer, the owner is shown what changed since (and any [problems](#when-the-song-changes)). They then update or confirm the arrangement, which sets this to the current revision. |
| `defaults.transposeSteps` | Semitones from the song's key, −11 to 11. The arrangement's key follows (G + 2 = A). |
| `defaults.capo` | Capo fret. The capo lives here only, never on the song. It's for display: chords are stored at concert pitch, and whether guitarists see sounding or fingered shapes is their own preference. |
| `defaults.tempo`, `timeSignature` | Override the song's. `null` keeps the song's. |
| `defaults.guitarTuning`, `guitarTuningNotes` | As in v1. |

## Everything is written in the song's key

Chord overrides, inserted lines and hidden chords are all written against
the song as stored, in the song's own key. The arrangement's
`transposeSteps` and any `keyChange` are applied afterwards, to the song's
chords and the overrides alike. Transposing an arrangement therefore never
means rewriting its overrides.

v1 left this open, and its Morning Light example shows the problem. The
final chorus modulates up a minor third to B♭ *and* overrides the chorus's
`D` with `F`. `F` is just that `D` moved up a minor third. Read as "written
in the key being played", the override changes nothing. Read as "written in
the song's key", it becomes A♭ once transposed. The v1→v2 converter uses the
first reading and drops the override, with a warning.

## Items

An item is one pass through a section: the song's
[`SectionInstance`](song-document-v2.md#flow-the-order-its-sung-in) plus
overrides.

```jsonc
{
  "id": "ai_09",
  "sectionId": "sec_chorus",
  "label": "Final Chorus",
  "keyChange": { "steps": 3, "key": "Bb" },
  "tempo": null,
  "timeSignature": null,
  "note": "Modulate up a minor third, full band",
  "durationSeconds": 20,
  "overrides": [ … ]
}
```

A new arrangement starts as a copy of the song's `flow`. Key changes add up
along the items: each `steps` is relative to the key in effect before it,
counting from the song's key plus `defaults.transposeSteps`.

## Overrides

| Type | Fields | Effect on this pass |
|---|---|---|
| `chord` | `chordId`, `raw` | Plays `raw` (in the song's key) instead. |
| `hide_chord` | `chordId` | Leaves the chord out for everyone. |
| `lyric` | `lineId`, `text`, `chordPositions?` | Sings `text` instead. The line's chords keep their IDs. `chordPositions` gives the new `at` of any that move; the rest stay where they were, pulled in to the end of a shorter line. |
| `hide_line` | `lineId` | Skips the line. |
| `insert_line` | `afterLineId` (`null` = before the first), `line` | Adds a line. Its IDs start with `ins_` and belong to this arrangement; other overrides on the same item can point at them. |
| `performance_note` | `lineId`, `note` | A note on a line. |

Overrides that point at a chord (`chord`, `hide_chord`) can name the song's
chords or chords in this item's inserted lines.

### Rendering a pass

1. Take the section from the song (`sectionId`).
2. Remove hidden lines.
3. Insert inserted lines.
4. Replace lyrics (moving the chords as `chordPositions` says).
5. Replace chords, then remove hidden chords.
6. Attach performance notes.
7. Transpose everything by the key in effect (`transposeSteps` plus key changes so far).
8. Apply the player's personal preferences (below).

The UI marks a pass that has overrides as different from the song's
version, so the band knows it's not the same as last time.

## When the song changes

`findArrangementProblems(arrangement, song)` lists every reference that no
longer resolves:
- a section, line or chord that was deleted;
- a lyric override whose chord positions no longer fit.

When the song's `revision` is newer than `songRevision`, the owner is asked
to review:
- The arrangement keeps working meanwhile.
- A problem is shown on its pass, never silently dropped.
- Nothing is migrated automatically.

## Personal chart preferences

A player's own view of a chart, kept per user and per arrangement (or per
song when playing without one). It is never shared and never changes the
arrangement. It lives outside the arrangement, as the MIDI setup does
(`UserArrangementMidi`), so two players can read the same arrangement
differently.

```jsonc
{
  "$schema": "chart-preferences/v1",
  "hiddenChordIds": ["chd_ch_07", "ins_chd_01"],
  "simplifyChords": false,
  "hideBassNotes": true
}
```

| Field | Effect |
|---|---|
| `hiddenChordIds` | Chords this player doesn't want to see: the song's or the arrangement's inserted ones. Hidden from the preview and the performance chart; a quick tap brings them back. |
| `simplifyChords` | Every chord shown as its basic triad (Gmaj7 → G, Bm7b5 → Bdim) via `simplifyChord()`. |
| `hideBassNotes` | D/F# shown as D. |

This is for the player who knows a chord belongs there but can't change
that fast yet. The arrangement's `hide_chord` is the band-wide equivalent.

## MIDI

Unchanged: MIDI triggers are per user and per arrangement, stored apart
from the arrangement (see the product spec). They point at item IDs, which
v2 keeps.

## Migrating from v1

`arrangementDocumentV1ToV2(arrangement, songV1)`:

- **Item fields:** `instanceLabel` → `label`, `performanceNote` → `note`,
  `durationOverrideSeconds` → `durationSeconds`, `keyOverride` →
  `keyChange` (`transposeSteps` → `steps`).
- **Arrangement key:** `defaults.transposeSteps` is kept. If it's missing,
  it's worked out from `defaults.key`.
- **Chord overrides:** read as written in the key being played at that
  point, then rewritten in the song's key (see above). One that turns out
  to be the song's own chord is dropped, with a warning.
- **Lyric overrides:** all segment replacements on one line become one
  `lyric` override for the line, with the positions of any chords that
  moved.
- **Inserted lines:** converted like song lines, keeping their `ins_` IDs.
- **`frozenAt`:** dropped with a warning to review. `songRevision` starts
  at the converted song's revision.
