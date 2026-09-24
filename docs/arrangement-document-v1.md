> **Superseded by [ArrangementDocument v2](arrangement-document-v2.md).** Kept for reference.

# ArrangementDocument v1 — JSON Specification

**Version:** 1.0.0
**Status:** Implementation contract

---

## Overview

The ArrangementDocument describes how a Song Version is performed: its section sequence, repeated sections, instance-level overrides, and timing notes.

It is stored in `Arrangement.documentJson` in the database.

The ArrangementDocument **does not duplicate** section content from the SongDocument. It references canonical sections by their stable IDs and applies patches where the performance differs from the original.

---

## Top-Level Structure

```json
{
  "$schema": "arrangement-document/v1",
  "songVersionId": "svr_01HXYZ",
  "songDocumentSchema": "song-document/v1",
  "frozenAt": null,
  "defaults": { ... },
  "items": [ ... ]
}
```

### Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `$schema` | `string` | ✅ | Always `"arrangement-document/v1"` |
| `songVersionId` | `string` | ✅ | Reference to the Song Version this arrangement is based on |
| `songDocumentSchema` | `string` | ✅ | Schema version of the SongDocument at time of creation |
| `frozenAt` | `string \| null` | ❌ | ISO 8601 timestamp. Set when the upstream SongDocument changes and this arrangement is frozen pending review. Null if not frozen. |
| `defaults` | `ArrangementDefaults` | ✅ | Arrangement-level overrides to music defaults |
| `items` | `ArrangementItem[]` | ✅ | Ordered sequence of section instances |

---

## ArrangementDefaults

Arrangement defaults override the SongDocument music defaults for this specific performance context.

```json
{
  "defaults": {
    "key": "A",
    "keyNormalized": { "root": "A", "accidental": null, "mode": "major" },
    "tempo": 80,
    "timeSignature": { "numerator": 4, "denominator": 4 },
    "capo": 2,
    "transposeSteps": 2,
    "guitarTuning": "DADGAD",
    "guitarTuningNotes": ["D", "A", "D", "G", "A", "D"]
  }
}
```

### ArrangementDefaults Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `key` | `string \| null` | ❌ | Override key for this arrangement |
| `keyNormalized` | `NormalizedKey \| null` | ❌ | Parsed key override |
| `tempo` | `number \| null` | ❌ | Override BPM |
| `timeSignature` | `TimeSignature \| null` | ❌ | Override time signature |
| `capo` | `number \| null` | ❌ | Guitar capo fret (display only; chords shown at capo-relative pitch) |
| `transposeSteps` | `number \| null` | ❌ | Semitones to transpose from the SongDocument key. Negative = down. |
| `guitarTuning` | `string \| null` | ❌ | Named tuning preset slug: `"standard"`, `"dadgad"`, `"drop_d"`, `"open_g"` etc. Null = standard. |
| `guitarTuningNotes` | `string[] \| null` | ❌ | Explicit open string notes low→high. Set alongside `guitarTuning` for rendering. e.g. `["D","A","D","G","A","D"]` |

All fields are optional. A null value means "inherit from SongDocument defaults."

### Guitar Tuning Behaviour

When `guitarTuning` is set:

- The chord diagram panel queries `ChordVoicing` filtered by that tuning preset
- If no voicings are cached for a chord in that tuning, a generation job is dispatched via BullMQ; the UI shows a loading state (typically < 1 second per chord)
- The scale visualizer fretboard re-renders with correct string labels and note positions for the tuning
- Capo position is applied on top of the tuning — both can coexist

Standard tuning is the default. `guitarTuning: null` falls back to standard (E A D G B E).

---

## ArrangementItems

An ArrangementItem represents one instance of a section in the performance sequence. Multiple items may reference the same canonical section ID (for repeated sections).

```json
{
  "items": [
    {
      "id": "ai_01",
      "sectionId": "sec_01",
      "instanceLabel": null,
      "overrides": [],
      "performanceNote": null,
      "durationOverrideSeconds": null
    },
    {
      "id": "ai_02",
      "sectionId": "sec_02",
      "instanceLabel": "Chorus 1",
      "overrides": [],
      "performanceNote": "Softer dynamic",
      "durationOverrideSeconds": null
    },
    {
      "id": "ai_03",
      "sectionId": "sec_01",
      "instanceLabel": "Verse 2",
      "overrides": [
        {
          "type": "lyric",
          "segmentId": "seg_02",
          "value": "is thy com-"
        }
      ],
      "performanceNote": null,
      "durationOverrideSeconds": null
    },
    {
      "id": "ai_04",
      "sectionId": "sec_02",
      "instanceLabel": "Final Chorus",
      "overrides": [
        {
          "type": "chord",
          "chordId": "chd_03",
          "raw": "D",
          "normalized": {
            "root": "D", "accidental": null, "quality": "major",
            "extensions": [], "bass": null, "bassAccidental": null
          }
        },
        {
          "type": "hide_line",
          "lineId": "line_02"
        }
      ],
      "performanceNote": "Hold last chord",
      "durationOverrideSeconds": 12
    }
  ]
}
```

### ArrangementItem Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | ✅ | **Stable** arrangement item ID |
| `sectionId` | `string` | ✅ | Reference to a canonical section ID in the SongDocument |
| `instanceLabel` | `string \| null` | ❌ | Display label for this instance (e.g. `"Verse 2"`, `"Final Chorus"`) |
| `keyOverride` | `KeyOverride \| null` | ❌ | Mid-song key change starting at this item |
| `overrides` | `Override[]` | ✅ | Patch list for this instance (empty array = no overrides) |
| `performanceNote` | `string \| null` | ❌ | Free text note for performers (e.g. `"Softer dynamic"`) |
| `durationOverrideSeconds` | `number \| null` | ❌ | Override duration for autoscroll timing |

---

---

## KeyOverride

An optional field on ArrangementItem that triggers a mid-song key change when the transport reaches this item.

```json
{
  "key": "Ab",
  "keyNormalized": { "root": "A", "accidental": "flat", "mode": "major" },
  "transposeSteps": 1
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `key` | `string` | ✅ | Raw key symbol for display |
| `keyNormalized` | `NormalizedKey` | ✅ | Parsed key |
| `transposeSteps` | `number` | ✅ | Semitone delta from the arrangement default key |

When `keyOverride` is set on an item, all subsequent items use that key for chord rendering until another `keyOverride` is encountered or the arrangement ends.

The transport model tracks `currentEffectiveKey` and updates it when a key-change item is reached.

A visual key change indicator is rendered between sections in the UI when the effective key shifts.

---

## MIDI Triggers

MIDI events are **not stored in the ArrangementDocument**. They are stored in a separate `UserArrangementMidi` record, keyed by `(userId, arrangementId)`.

This keeps the arrangement portable and shareable — two musicians can use the same arrangement with completely different MIDI setups.

See the MIDI Output section of the product spec for the full `UserArrangementMidi` structure.

---

## Overrides

An override is a patch applied to a specific arrangement item instance. It describes a single change without duplicating the source section.

### Override Types

#### `chord` — Change a chord in this instance

```json
{
  "type": "chord",
  "chordId": "chd_03",
  "raw": "D",
  "normalized": {
    "root": "D", "accidental": null, "quality": "major",
    "extensions": [], "bass": null, "bassAccidental": null
  }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | `"chord"` | ✅ | Override type |
| `chordId` | `string` | ✅ | Stable chord ID from the SongDocument |
| `raw` | `string` | ✅ | New raw chord symbol |
| `normalized` | `NormalizedChord \| null` | ❌ | Parsed override chord |

---

#### `lyric` — Change a lyric segment in this instance

```json
{
  "type": "lyric",
  "segmentId": "seg_02",
  "value": "is thy com-"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | `"lyric"` | ✅ | Override type |
| `segmentId` | `string` | ✅ | Stable segment ID from the SongDocument |
| `value` | `string` | ✅ | Replacement lyric text |

---

#### `hide_line` — Hide a line in this instance

```json
{
  "type": "hide_line",
  "lineId": "line_02"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | `"hide_line"` | ✅ | Override type |
| `lineId` | `string` | ✅ | Stable line ID from the SongDocument |

---

#### `insert_line` — Insert an extra line in this instance

```json
{
  "type": "insert_line",
  "afterLineId": "line_02",
  "line": {
    "id": "ins_line_01",
    "segments": [
      {
        "id": "ins_seg_01",
        "lyric": "To God be the glory",
        "chord": {
          "id": "ins_chd_01",
          "raw": "G",
          "normalized": {
            "root": "G", "accidental": null, "quality": "major",
            "extensions": [], "bass": null, "bassAccidental": null
          }
        }
      }
    ]
  }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | `"insert_line"` | ✅ | Override type |
| `afterLineId` | `string \| null` | ❌ | Insert after this line ID. Null = insert at start of section. |
| `line` | `Line` | ✅ | The new line to insert. Uses the same Line/Segment/Chord model as SongDocument. IDs prefixed with `ins_` by convention. |

---

#### `performance_note` — Attach a note to a specific line

```json
{
  "type": "performance_note",
  "lineId": "line_02",
  "note": "Repeat x3, build dynamics"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | `"performance_note"` | ✅ | Override type |
| `lineId` | `string` | ✅ | Stable line ID from the SongDocument |
| `note` | `string` | ✅ | Performance note text |

---

## Frozen Arrangements

When a global SongDocument is modified and its section/line/segment/chord IDs change, all downstream Arrangements are **frozen**.

Frozen behavior:

- `frozenAt` is set to the timestamp of the upstream change
- The Arrangement continues to render using its last-known override patches
- The owner is notified that the source has changed
- No automatic migration is attempted
- The owner must review the diff and manually update or dismiss the freeze

### Detecting Staleness

When rendering a frozen arrangement:

1. Compare `items[*].sectionId` against current SongDocument section IDs
2. Compare `overrides[*].chordId / segmentId / lineId` against current IDs
3. Flag any references that no longer resolve in the current SongDocument

---

## ID Stability Rules

| ID type | Prefix convention | Stability rule |
|---|---|---|
| ArrangementItem | `ai_` | Generated once; never changed |
| Inserted line | `ins_line_` | Generated once; specific to this arrangement item |
| Inserted segment | `ins_seg_` | Generated once; specific to this arrangement item |
| Inserted chord | `ins_chd_` | Generated once; specific to this arrangement item |

---

## Rendering Logic

When rendering an ArrangementItem, apply overrides in this order:

1. Start with the canonical section from SongDocument (resolved by `sectionId`)
2. Apply `hide_line` overrides (remove lines from render)
3. Apply `insert_line` overrides (inject new lines at specified positions)
4. Apply `lyric` overrides (replace lyric text on matching segments)
5. Apply `chord` overrides (replace chord on matching chord IDs)
6. Attach `performance_note` overrides to their target lines

If any referenced ID (`sectionId`, `chordId`, `segmentId`, `lineId`) does not resolve in the current SongDocument:

- Render the override as unresolved (show a visual warning)
- Do not silently drop the override

---

## UI Visual Distinction

When an ArrangementItem has one or more overrides, the UI must indicate this with a **discrete visual distinction** from unmodified instances of the same section.

Examples:

- a subtle tinted background or border on the section card
- an "edited" badge
- a diff tooltip showing what differs from the original

---

## Full Example

```json
{
  "$schema": "arrangement-document/v1",
  "songVersionId": "svr_01HXYZ",
  "songDocumentSchema": "song-document/v1",
  "frozenAt": null,
  "defaults": {
    "key": "A",
    "keyNormalized": { "root": "A", "accidental": null, "mode": "major" },
    "tempo": 80,
    "timeSignature": { "numerator": 4, "denominator": 4 },
    "capo": 2,
    "transposeSteps": 2,
    "guitarTuning": null,
    "guitarTuningNotes": null
  },
  "items": [
    {
      "id": "ai_01",
      "sectionId": "sec_01",
      "instanceLabel": "Verse 1",
      "overrides": [],
      "performanceNote": null,
      "durationOverrideSeconds": null
    },
    {
      "id": "ai_02",
      "sectionId": "sec_02",
      "instanceLabel": "Chorus",
      "overrides": [],
      "performanceNote": "Soft and gentle",
      "durationOverrideSeconds": null
    },
    {
      "id": "ai_03",
      "sectionId": "sec_01",
      "instanceLabel": "Verse 2",
      "overrides": [
        {
          "type": "lyric",
          "segmentId": "seg_02",
          "value": "is thy com-"
        }
      ],
      "performanceNote": null,
      "durationOverrideSeconds": null
    },
    {
      "id": "ai_04",
      "sectionId": "sec_02",
      "instanceLabel": "Final Chorus",
      "overrides": [
        {
          "type": "chord",
          "chordId": "chd_03",
          "raw": "D",
          "normalized": {
            "root": "D", "accidental": null, "quality": "major",
            "extensions": [], "bass": null, "bassAccidental": null
          }
        },
        {
          "type": "insert_line",
          "afterLineId": "line_02",
          "line": {
            "id": "ins_line_01",
            "segments": [
              {
                "id": "ins_seg_01",
                "lyric": "Forever and ever, amen",
                "chord": {
                  "id": "ins_chd_01",
                  "raw": "G",
                  "normalized": {
                    "root": "G", "accidental": null, "quality": "major",
                    "extensions": [], "bass": null, "bassAccidental": null
                  }
                }
              }
            ]
          }
        }
      ],
      "performanceNote": "Hold final chord, fade out",
      "durationOverrideSeconds": 16
    }
  ]
}
```
