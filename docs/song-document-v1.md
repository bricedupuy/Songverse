> **Superseded by [SongDocument v2](song-document-v2.md).** Kept for history: every stored document is v2, and the code that read v1 has been removed (issue #60).

# SongDocument v1 — JSON Specification

**Version:** 1.0.0
**Status:** Implementation contract

---

## Overview

The SongDocument is the canonical structured representation of a Song Version's content. It is stored in `SongVersion.documentJson` in the database.

ChordPro and other formats are derived from this document — they are **not** the source of truth.

---

## Top-Level Structure

```json
{
  "$schema": "song-document/v1",
  "metadata": { ... },
  "defaults": { ... },
  "sections": [ ... ]
}
```

### Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `$schema` | `string` | ✅ | Always `"song-document/v1"` |
| `metadata` | `Metadata` | ✅ | Snapshot of song version metadata |
| `defaults` | `MusicDefaults` | ✅ | Key, tempo, time signature, duration |
| `sections` | `Section[]` | ✅ | Ordered list of song sections |

---

## Metadata Snapshot

The metadata block is a **snapshot** for rendering purposes. The authoritative values live in the database. This snapshot is regenerated on save.

```json
{
  "metadata": {
    "title": "Great Is Thy Faithfulness",
    "alternateTitle": "Grande é a Tua Fidelidade",
    "language": "en",
    "ccli": "18723",
    "copyright": "© 1923 Hope Publishing Company",
    "copyrightYear": 1923,
    "publisher": "Hope Publishing Company",
    "trustLabel": "Official publisher text",
    "contributors": [
      {
        "userId": "usr_01HXYZ",
        "displayName": "Thomas O. Chisholm",
        "source": "Hope Publishing",
        "roles": ["author", "lyricist"]
      }
    ]
  }
}
```

### Metadata Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `title` | `string` | ✅ | Display title |
| `alternateTitle` | `string` | ❌ | Optional alternate or translated title |
| `language` | `string` | ✅ | BCP 47 language tag (e.g. `"en"`, `"fr"`, `"de"`) |
| `ccli` | `string` | ❌ | CCLI song number |
| `copyright` | `string` | ❌ | Full copyright text |
| `copyrightYear` | `number` | ❌ | Copyright year |
| `publisher` | `string` | ❌ | Publisher name (free text) |
| `trustLabel` | `string` | ❌ | Optional trust/source note |
| `contributors` | `ContributorSnapshot[]` | ❌ | Contributor snapshots |

### ContributorSnapshot Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `userId` | `string` | ✅ | Reference to registered user |
| `displayName` | `string` | ✅ | Name as displayed on this version |
| `source` | `string` | ❌ | Free text external source credit |
| `roles` | `ContributorRole[]` | ✅ | One or more roles |

### ContributorRole Enum

`"author"` `"composer"` `"lyricist"` `"translator"` `"adaptor"` `"arranger"` `"performer"`

---

## MusicDefaults

```json
{
  "defaults": {
    "key": "G",
    "keyNormalized": { "root": "G", "accidental": null, "mode": "major" },
    "tempo": 72,
    "timeSignature": { "numerator": 4, "denominator": 4 },
    "durationSeconds": 285
  }
}
```

### MusicDefaults Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `key` | `string` | ❌ | Raw key symbol as entered (e.g. `"G"`, `"Bb"`, `"F#m"`) |
| `keyNormalized` | `NormalizedKey` | ❌ | Parsed key representation |
| `tempo` | `number` | ❌ | BPM |
| `timeSignature` | `TimeSignature` | ❌ | Numerator / denominator |
| `durationSeconds` | `number` | ❌ | Estimated or recorded duration |

### NormalizedKey Fields

| Field | Type | Values |
|---|---|---|
| `root` | `string` | `C D E F G A B` |
| `accidental` | `string \| null` | `"sharp"`, `"flat"`, `null` |
| `mode` | `string` | `"major"`, `"minor"` |

### TimeSignature Fields

| Field | Type | Description |
|---|---|---|
| `numerator` | `number` | Beats per measure (e.g. 4, 3, 6) |
| `denominator` | `number` | Beat unit (e.g. 4, 8) |

Supported at MVP: `4/4`, `3/4`, `6/8`, `2/4`. Others valid but UI may not render grooves for them.

---

## Sections

```json
{
  "sections": [
    {
      "id": "sec_01",
      "type": "verse",
      "label": "Verse 1",
      "lines": [ ... ],
      "rhythmMap": null
    }
  ]
}
```

### Section Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | ✅ | **Stable** section ID. Never regenerated after creation. |
| `type` | `SectionType` | ✅ | Section type |
| `label` | `string` | ❌ | Display label override (e.g. `"Verse 1"`, `"Chorus"`) |
| `lines` | `Line[]` | ✅ | Ordered lines in this section |
| `rhythmMap` | `RhythmMap \| null` | ❌ | Optional timing layer |
| `groove` | `GrooveRef \| null` | ❌ | Optional drum groove assignment for this section |

### SectionType Enum

`"intro"` `"verse"` `"chorus"` `"pre-chorus"` `"post-chorus"` `"bridge"` `"instrumental"` `"outro"` `"tag"` `"other"`

---

## Lines

```json
{
  "id": "line_01",
  "segments": [ ... ]
}
```

### Line Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | ✅ | **Stable** line ID |
| `segments` | `Segment[]` | ✅ | Ordered segments (lyric + chord pairs) |

---

## Segments

A segment is the atomic unit of a line: a piece of lyric text with an optional chord anchored above it.

```json
{
  "id": "seg_01",
  "lyric": "Great ",
  "chord": {
    "id": "chd_01",
    "raw": "G",
    "normalized": {
      "root": "G",
      "accidental": null,
      "quality": "major",
      "extensions": [],
      "bass": null,
      "bassAccidental": null
    }
  }
}
```

```json
{
  "id": "seg_02",
  "lyric": "is thy faith-",
  "chord": null
}
```

### Segment Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | ✅ | **Stable** segment ID |
| `lyric` | `string` | ✅ | Lyric text fragment (may be empty string for chord-only segments) |
| `chord` | `Chord \| null` | ❌ | Optional chord anchored at the start of this segment |

---

## Chords

### Chord Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | ✅ | **Stable** chord ID |
| `raw` | `string` | ✅ | Raw chord symbol as entered or imported (preserved exactly) |
| `normalized` | `NormalizedChord \| null` | ❌ | Parsed chord representation; null if parsing fails |

### NormalizedChord Fields

| Field | Type | Description |
|---|---|---|
| `root` | `string` | Root note: `C D E F G A B` |
| `accidental` | `string \| null` | `"sharp"`, `"flat"`, or `null` |
| `quality` | `ChordQuality` | See enum below |
| `extensions` | `string[]` | e.g. `["7"]`, `["maj7"]`, `["9", "sus4"]` |
| `bass` | `string \| null` | Bass note for slash chords |
| `bassAccidental` | `string \| null` | Accidental for bass note |

### ChordQuality Enum

`"major"` `"minor"` `"diminished"` `"augmented"` `"sus2"` `"sus4"` `"dominant"`

---

## Rhythm Map (Optional)

The rhythm map is a lightweight timing layer attached to a section. It does not replace the structural segment model.

```json
{
  "rhythmMap": {
    "measureCount": 4,
    "beatsPerMeasure": 4,
    "measures": [
      {
        "index": 0,
        "chordEvents": [
          { "beat": 1, "segmentId": "seg_01" },
          { "beat": 3, "segmentId": "seg_03" }
        ],
        "lyricAnchor": "seg_01",
        "cue": null
      }
    ]
  }
}
```

### RhythmMap Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `measureCount` | `number` | ✅ | Total measures in section |
| `beatsPerMeasure` | `number` | ✅ | Beats per measure |
| `measures` | `Measure[]` | ✅ | Per-measure data |

### Measure Fields

| Field | Type | Description |
|---|---|---|
| `index` | `number` | Zero-based measure index |
| `chordEvents` | `ChordEvent[]` | Chord changes within the measure |
| `lyricAnchor` | `string \| null` | Segment ID where lyric starts in this measure |
| `cue` | `string \| null` | Optional performance cue text |

### ChordEvent Fields

| Field | Type | Description |
|---|---|---|
| `beat` | `number` | Beat number (1-based) |
| `segmentId` | `string` | ID of the segment that begins on this beat |

---

## ID Stability Rules

**IDs are stable and must never be regenerated on save.**

| ID type | Prefix convention | Stability rule |
|---|---|---|
| Section | `sec_` | Generated once at creation; never changed |
| Line | `line_` | Generated once at creation; never changed |
| Segment | `seg_` | Generated once at creation; never changed |
| Chord | `chd_` | Generated once at creation; never changed |

When content is deleted, its ID is retired and must **never be reused**.

When content is moved (e.g. a line reordered), the ID follows the content — it does not change.

---

## Notation Rendering

Notation (English vs. Solfège) is a **user display preference**. It is applied at render time, not stored in the document.

### English Notation
`C  C#/Db  D  D#/Eb  E  F  F#/Gb  G  G#/Ab  A  A#/Bb  B`

### Solfège Notation
`Do  Do#/Réb  Ré  Ré#/Mib  Mi  Fa  Fa#/Solb  Sol  Sol#/Lab  La  La#/Sib  Si`

The mapping is applied to `NormalizedChord.root` and `NormalizedChord.bass` when rendering.

---

## ChordPro Export Mapping

When exporting to ChordPro, the document maps as follows:

| SongDocument concept | ChordPro output |
|---|---|
| Section | `{start_of_verse}` / `{start_of_chorus}` / etc. |
| Line | Newline-separated line |
| Segment with chord | `[G]Great ` |
| Segment without chord | `is thy faith-` |
| Metadata title | `{title: Great Is Thy Faithfulness}` |
| Key | `{key: G}` |
| Tempo | `{tempo: 72}` |
| CCLI | `{ccli: 18723}` |

---

## Full Example

```json
{
  "$schema": "song-document/v1",
  "metadata": {
    "title": "Great Is Thy Faithfulness",
    "alternateTitle": null,
    "language": "en",
    "ccli": "18723",
    "copyright": "© 1923 Hope Publishing Company",
    "copyrightYear": 1923,
    "publisher": "Hope Publishing Company",
    "trustLabel": "Official publisher text",
    "contributors": [
      {
        "userId": "usr_01HXYZ",
        "displayName": "Thomas O. Chisholm",
        "source": null,
        "roles": ["author", "lyricist"]
      },
      {
        "userId": "usr_02HABC",
        "displayName": "William M. Runyan",
        "source": null,
        "roles": ["composer"]
      }
    ]
  },
  "defaults": {
    "key": "G",
    "keyNormalized": { "root": "G", "accidental": null, "mode": "major" },
    "tempo": 72,
    "timeSignature": { "numerator": 4, "denominator": 4 },
    "durationSeconds": 285
  },
  "sections": [
    {
      "id": "sec_01",
      "type": "verse",
      "label": "Verse 1",
      "rhythmMap": null,
      "lines": [
        {
          "id": "line_01",
          "segments": [
            {
              "id": "seg_01",
              "lyric": "Great ",
              "chord": {
                "id": "chd_01",
                "raw": "G",
                "normalized": {
                  "root": "G", "accidental": null, "quality": "major",
                  "extensions": [], "bass": null, "bassAccidental": null
                }
              }
            },
            {
              "id": "seg_02",
              "lyric": "is thy faith-",
              "chord": null
            },
            {
              "id": "seg_03",
              "lyric": "ful-",
              "chord": {
                "id": "chd_02",
                "raw": "C",
                "normalized": {
                  "root": "C", "accidental": null, "quality": "major",
                  "extensions": [], "bass": null, "bassAccidental": null
                }
              }
            },
            {
              "id": "seg_04",
              "lyric": "ness",
              "chord": null
            }
          ]
        }
      ]
    },
    {
      "id": "sec_02",
      "type": "chorus",
      "label": "Chorus",
      "rhythmMap": null,
      "lines": [
        {
          "id": "line_02",
          "segments": [
            {
              "id": "seg_05",
              "lyric": "Great is thy faith-ful-ness",
              "chord": {
                "id": "chd_03",
                "raw": "G",
                "normalized": {
                  "root": "G", "accidental": null, "quality": "major",
                  "extensions": [], "bass": null, "bassAccidental": null
                }
              }
            }
          ]
        }
      ]
    }
  ]
}
```
