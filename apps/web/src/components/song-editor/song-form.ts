import {
  detectImportFormat,
  formatDuration,
  parseDuration,
  sectionsToChordPro,
  type CreateSongVersionInput,
  type SongVersionDetail,
  type SupportedImportFormat,
  type UpdateSongVersionInput,
} from "@songverse/core";

/** The credit lists the editor edits, and the role each one is. */
export const CREDIT_FIELDS = {
  artists: "PERFORMER",
  composers: "COMPOSER",
  lyricists: "LYRICIST",
  writers: "AUTHOR",
  arrangers: "ARRANGER",
  translators: "TRANSLATOR",
  adaptors: "ADAPTOR",
} as const;
export type CreditField = keyof typeof CREDIT_FIELDS;

const TEXT_FIELDS = [
  "title",
  "versionName",
  "alternateTitle",
  "sortTitle",
  "language",
  "album",
  "year",
  "key",
  "tempo",
  "timeSignature",
  "capo",
  "duration",
  "copyright",
  "ccli",
  "isrc",
  "reference",
  "notes",
] as const;
export type TextField = (typeof TEXT_FIELDS)[number];

/** Everything the editor edits, as the inputs hold it (text, mostly). */
export type SongForm = Record<TextField, string> &
  Record<CreditField, string[]> & {
    tagIds: string[];
    content: string;
    /** The format picked by hand; null to go by what the text looks like. */
    contentFormat: SupportedImportFormat | null;
  };

export function emptyForm(language: string): SongForm {
  return {
    ...(Object.fromEntries(TEXT_FIELDS.map((field) => [field, ""])) as Record<TextField, string>),
    ...(Object.fromEntries(Object.keys(CREDIT_FIELDS).map((field) => [field, []])) as unknown as Record<CreditField, string[]>),
    language,
    tagIds: [],
    content: "",
    contentFormat: null,
  };
}

function creditNames(version: SongVersionDetail, role: string): string[] {
  return version.contributors.filter((c) => c.roles.includes(role) && c.source).map((c) => c.source!);
}

export function formFromVersion(version: SongVersionDetail): SongForm {
  const defaults = version.documentJson.defaults;
  return {
    title: version.title,
    versionName: version.versionName ?? "",
    alternateTitle: version.alternateTitle ?? "",
    sortTitle: version.sortTitle ?? "",
    language: version.language,
    album: version.album ?? "",
    year: version.year?.toString() ?? "",
    key: defaults.key ?? "",
    tempo: defaults.tempo?.toString() ?? "",
    timeSignature: defaults.timeSignature ? `${defaults.timeSignature.numerator}/${defaults.timeSignature.denominator}` : "",
    capo: version.capo ? String(version.capo) : "",
    duration: defaults.durationSeconds ? formatDuration(defaults.durationSeconds) : "",
    copyright: version.copyright ?? "",
    ccli: version.ccli ?? "",
    isrc: version.isrc ?? "",
    reference: version.reference ?? "",
    notes: version.notes ?? "",
    ...(Object.fromEntries(
      Object.entries(CREDIT_FIELDS).map(([field, role]) => [field, creditNames(version, role)]),
    ) as unknown as Record<CreditField, string[]>),
    tagIds: version.tags.map((tag) => tag.id),
    content: sectionsToChordPro(version.documentJson.sections),
    contentFormat: null,
  };
}

/** The format the content will be read as. */
export function effectiveFormat(form: Pick<SongForm, "content" | "contentFormat">): SupportedImportFormat {
  return form.contentFormat ?? detectImportFormat(form.content);
}

export type FormError =
  | "titleRequired"
  | "artistRequired"
  | "yearInvalid"
  | "tempoInvalid"
  | "durationInvalid"
  | "isrcInvalid";

/** Problems by field, the same rules the API checks. */
export function validate(form: SongForm): Partial<Record<TextField | "artists", FormError>> {
  const errors: Partial<Record<TextField | "artists", FormError>> = {};
  if (!form.title.trim()) errors.title = "titleRequired";
  if (form.artists.length === 0) errors.artists = "artistRequired";
  const year = form.year.trim();
  if (year && (!/^\d{4}$/.test(year) || Number(year) < 1000 || Number(year) > 2999)) errors.year = "yearInvalid";
  const tempo = form.tempo.trim();
  if (tempo && (!/^\d+$/.test(tempo) || Number(tempo) < 20 || Number(tempo) > 400)) errors.tempo = "tempoInvalid";
  if (form.duration.trim() && parseDuration(form.duration.trim()) === null) errors.duration = "durationInvalid";
  if (form.isrc.trim() && !/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(form.isrc.replace(/[\s-]/g, "").toUpperCase())) errors.isrc = "isrcInvalid";
  return errors;
}

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((value, index) => value === b[index]);

/** Whether a field differs from how it started. */
export function fieldChanged(form: SongForm, initial: SongForm, field: keyof SongForm): boolean {
  const a = form[field];
  const b = initial[field];
  if (Array.isArray(a) && Array.isArray(b)) return !sameList(a, b);
  if (field === "content") return a !== b;
  if (field === "contentFormat") return false;
  return (a ?? "").toString().trim() !== (b ?? "").toString().trim();
}

export function isDirty(form: SongForm, initial: SongForm): boolean {
  return (Object.keys(form) as (keyof SongForm)[]).some((field) => fieldChanged(form, initial, field));
}

function textValue(form: SongForm, field: TextField): string | number | null {
  const text = form[field].trim();
  switch (field) {
    case "year":
    case "tempo":
      return text ? Number(text) : null;
    case "capo":
      return text ? Number(text) : null;
    default:
      return text || null;
  }
}

/** What the API takes for the fields that changed (all of them, against an empty form). */
function changedFields(form: SongForm, initial: SongForm): UpdateSongVersionInput {
  const data: Record<string, unknown> = {};
  for (const field of TEXT_FIELDS) {
    if (!fieldChanged(form, initial, field)) continue;
    if (field === "duration") data.durationSeconds = form.duration.trim() ? parseDuration(form.duration.trim()) : null;
    else if (field === "title" || field === "language") data[field] = form[field].trim();
    else data[field] = textValue(form, field);
  }
  for (const field of Object.keys(CREDIT_FIELDS) as CreditField[]) {
    if (fieldChanged(form, initial, field)) data[field] = form[field];
  }
  if (fieldChanged(form, initial, "tagIds")) data.tagIds = form.tagIds;
  if (fieldChanged(form, initial, "content")) {
    data.content = form.content;
    data.contentFormat = effectiveFormat(form);
  }
  return data as UpdateSongVersionInput;
}

export function toCreateInput(form: SongForm): CreateSongVersionInput {
  const blank = emptyForm(form.language);
  blank.language = "";
  const data = changedFields(form, blank);
  return { ...data, title: form.title.trim(), language: form.language, artists: form.artists };
}

export function toUpdateInput(form: SongForm, initial: SongForm): UpdateSongVersionInput {
  return changedFields(form, initial);
}

/** Copies a song's details into the fields still empty (for "Use as base"). */
export function fillFrom(form: SongForm, source: SongForm): SongForm {
  const next = { ...form };
  for (const field of TEXT_FIELDS) {
    if (field === "versionName") continue;
    if (!next[field].trim()) next[field] = source[field];
  }
  for (const field of Object.keys(CREDIT_FIELDS) as CreditField[]) {
    if (next[field].length === 0) next[field] = source[field];
  }
  if (next.tagIds.length === 0) next.tagIds = source.tagIds;
  if (!next.content.trim()) next.content = source.content;
  return next;
}

export const KEY_OPTIONS = {
  major: ["C", "C#", "Db", "D", "Eb", "E", "F", "F#", "Gb", "G", "Ab", "A", "Bb", "B"],
  minor: ["Cm", "C#m", "Dm", "D#m", "Ebm", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "Bbm", "Bm"],
};

export const TIME_SIGNATURE_OPTIONS = ["2/2", "2/4", "3/4", "4/4", "5/4", "6/4", "3/8", "6/8", "7/8", "9/8", "12/8"];

export const CAPO_OPTIONS = Array.from({ length: 11 }, (_, index) => String(index + 1));
