export const SECTION_TYPES = [
  "intro",
  "verse",
  "chorus",
  "pre-chorus",
  "post-chorus",
  "bridge",
  "instrumental",
  "outro",
  "tag",
  "other",
] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

export const CHORD_QUALITIES = [
  "major",
  "minor",
  "diminished",
  "augmented",
  "sus2",
  "sus4",
  "dominant",
] as const;
export type ChordQuality = (typeof CHORD_QUALITIES)[number];

export const NOTE_ROOTS = ["C", "D", "E", "F", "G", "A", "B"] as const;
export type NoteRoot = (typeof NOTE_ROOTS)[number];

export const ACCIDENTALS = ["sharp", "flat"] as const;
export type Accidental = (typeof ACCIDENTALS)[number];

export const KEY_MODES = ["major", "minor"] as const;
export type KeyMode = (typeof KEY_MODES)[number];

export const CONTRIBUTOR_ROLES = [
  "author",
  "composer",
  "lyricist",
  "translator",
  "adaptor",
  "arranger",
  "performer",
] as const;
export type ContributorRole = (typeof CONTRIBUTOR_ROLES)[number];

export const IMPORT_FORMATS = [
  "CHORDPRO",
  "CHORDS_OVER_LYRICS",
  "RAW_TEXT",
  "LRC",
  "MUSICXML",
  "ABC_NOTATION",
] as const;
export type ImportFormatValue = (typeof IMPORT_FORMATS)[number];

// The subset of IMPORT_FORMATS that actually has a parser today - the
// others (RAW_TEXT, LRC, MUSICXML, ABC_NOTATION) are reserved for later.
export const SUPPORTED_IMPORT_FORMATS = ["CHORDPRO", "CHORDS_OVER_LYRICS"] as const;
export type SupportedImportFormat = (typeof SUPPORTED_IMPORT_FORMATS)[number];

export const VOICING_PREFERENCES = ["OPEN", "BARRE", "DROP2", "CLOSE", "AUTO"] as const;
export type VoicingPreferenceValue = (typeof VOICING_PREFERENCES)[number];

export const CAPO_DISPLAY_MODES = ["SOUNDING", "FINGERED"] as const;
export type CapoDisplayModeValue = (typeof CAPO_DISPLAY_MODES)[number];

export const MIDI_EVENT_TYPES = ["program_change", "control_change"] as const;
export type MidiEventTypeValue = (typeof MIDI_EVENT_TYPES)[number];

export const OWNERSHIP_SCOPES = ["GLOBAL", "TEAM", "USER"] as const;
export type OwnershipScopeValue = (typeof OWNERSHIP_SCOPES)[number];

export const SONGBOOK_KINDS = ["SIMPLE", "NUMBERED"] as const;
export type SongbookKindValue = (typeof SONGBOOK_KINDS)[number];

export const PUBLICATION_STATES = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "NEEDS_CHANGES",
  "APPROVED",
  "REJECTED",
  "WITHDRAWN",
  "ARCHIVED",
] as const;
export type PublicationStateValue = (typeof PUBLICATION_STATES)[number];

export const TEAM_ROLES = ["MEMBER", "ADMIN"] as const;
export type TeamRoleValue = (typeof TEAM_ROLES)[number];

export const DISPLAY_MODES = ["SINGER", "GUITAR", "PIANO", "UKULELE", "LEADER", "DRUMMER"] as const;
export type DisplayModeValue = (typeof DISPLAY_MODES)[number];

// UI locales the app has translations for. French is first alongside the
// English default; add more here (and a matching packages/core/src/i18n
// dictionary) as new languages ship.
export const SUPPORTED_LOCALES = ["en", "fr"] as const;
export type LocaleValue = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: LocaleValue = "en";

// Seed tag category types (Section 10 of the spec). Admins can add more.
// `label` is the English fallback; `fr` seeds TagCategory.translations.
export const SEED_TAG_CATEGORIES = [
  { slug: "theme", label: "Theme", fr: "Thème" },
  { slug: "style", label: "Musical Style", fr: "Style musical" },
  { slug: "mood", label: "Mood / Energy", fr: "Ambiance" },
  { slug: "instrumentation", label: "Instrumentation", fr: "Instrumentation" },
] as const;

// Seed tuning presets (Section 22 of the spec).
export const SEED_TUNING_PRESETS = [
  { slug: "standard_guitar", name: "Standard", instrument: "GUITAR_STANDARD", notes: ["E", "A", "D", "G", "B", "E"], isDefault: true },
  { slug: "drop_d", name: "Drop D", instrument: "GUITAR_ALTERNATE", notes: ["D", "A", "D", "G", "B", "E"], isDefault: false },
  { slug: "dadgad", name: "DADGAD", instrument: "GUITAR_ALTERNATE", notes: ["D", "A", "D", "G", "A", "D"], isDefault: false },
  { slug: "open_g", name: "Open G", instrument: "GUITAR_ALTERNATE", notes: ["D", "G", "D", "G", "B", "D"], isDefault: false },
  { slug: "standard_ukulele", name: "Standard", instrument: "UKULELE_STANDARD", notes: ["G", "C", "E", "A"], isDefault: true },
] as const;
