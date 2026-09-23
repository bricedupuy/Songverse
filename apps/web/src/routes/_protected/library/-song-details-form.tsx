import { formatDuration, parseDuration, type SongVersionDetail, type UpdateSongVersionInput } from "@songverse/core";
import { Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { LanguageSelect } from "#/components/language-select";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import { apiClient } from "#/lib/api-client";

type FieldKey =
  | "title"
  | "alternateTitle"
  | "sortTitle"
  | "language"
  | "album"
  | "year"
  | "key"
  | "timeSignature"
  | "tempo"
  | "duration"
  | "copyright"
  | "ccli"
  | "isrc"
  | "reference"
  | "notes";

type FormValues = Record<FieldKey, string>;

function valuesOf(version: SongVersionDetail): FormValues {
  const defaults = version.documentJson.defaults;
  return {
    title: version.title,
    alternateTitle: version.alternateTitle ?? "",
    sortTitle: version.sortTitle ?? "",
    language: version.language,
    album: version.album ?? "",
    year: version.year?.toString() ?? "",
    key: defaults.key ?? "",
    timeSignature: defaults.timeSignature ? `${defaults.timeSignature.numerator}/${defaults.timeSignature.denominator}` : "",
    tempo: defaults.tempo?.toString() ?? "",
    duration: defaults.durationSeconds ? formatDuration(defaults.durationSeconds) : "",
    copyright: version.copyright ?? "",
    ccli: version.ccli ?? "",
    isrc: version.isrc ?? "",
    reference: version.reference ?? "",
    notes: version.notes ?? "",
  };
}

/** The changed fields, as the API takes them (empty clears); or the first problem. */
function toUpdate(values: FormValues, initial: FormValues): { data: UpdateSongVersionInput } | { error: string } {
  const data: UpdateSongVersionInput = {};
  const changed = (Object.keys(values) as FieldKey[]).filter((key) => values[key].trim() !== initial[key].trim());
  for (const key of changed) {
    const text = values[key].trim();
    if (key === "year" || key === "tempo") {
      if (text && !/^\d+$/.test(text)) return { error: `${key === "year" ? "Year" : "Tempo"} must be a whole number.` };
      data[key] = text ? Number(text) : null;
    } else if (key === "duration") {
      const seconds = text ? parseDuration(text) : null;
      if (text && seconds === null) return { error: "Duration must be like 3:45." };
      data.durationSeconds = seconds;
    } else if (key === "title" || key === "language") {
      data[key] = text;
    } else {
      data[key] = text || null;
    }
  }
  return { data };
}

/**
 * The song's own fields, each edited on its own. Artists are managed by
 * the caller (they're credits, saved as they're added), shown under Title.
 */
export function SongDetailsForm({ version, artists }: { version: SongVersionDetail; artists: ReactNode }) {
  const router = useRouter();
  const initial = useMemo(() => valuesOf(version), [version]);
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => setValues(initial), [initial]);

  const dirty = (Object.keys(values) as FieldKey[]).some((key) => values[key].trim() !== initial[key].trim());
  const field = (key: FieldKey) => ({
    id: `song-${key}`,
    value: values[key],
    onChange: (event: { target: { value: string } }) => {
      setValues((current) => ({ ...current, [key]: event.target.value }));
      setMessage(null);
    },
  });

  async function save() {
    const update = toUpdate(values, initial);
    if ("error" in update) {
      setMessage({ kind: "error", text: update.error });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await apiClient.updateSongVersion(version.id, update.data);
      await router.invalidate();
      setMessage({ kind: "ok", text: "Saved." });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "Couldn't save changes." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      {version.parentVersion ? (
        <p className="text-sm text-muted-foreground">
          {version.relationshipType === "DIRECT_TRANSLATION" ? "Translation of " : "Based on "}
          <Link to="/library/$songVersionId" params={{ songVersionId: version.parentVersion.id }} className="text-primary hover:underline">
            {version.parentVersion.title}
          </Link>{" "}
          ({version.parentVersion.language})
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="song-title">Title</Label>
        <Input {...field("title")} required />
      </div>

      {artists}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="song-alternateTitle">Subtitle</Label>
          <Input {...field("alternateTitle")} placeholder="A second title, or the first line" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="song-sortTitle">Sort title</Label>
          <Input {...field("sortTitle")} placeholder="If not sorted by its title" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="song-language">Language</Label>
          <LanguageSelect id="song-language" value={values.language} onChange={(language) => setValues((current) => ({ ...current, language }))} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="song-album">Album</Label>
          <Input {...field("album")} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="song-key">Key</Label>
          <Input {...field("key")} placeholder="G, Bb, C#m" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="song-timeSignature">Time signature</Label>
          <Input {...field("timeSignature")} placeholder="4/4" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="song-tempo">Tempo (BPM)</Label>
          <Input {...field("tempo")} inputMode="numeric" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="song-duration">Duration</Label>
          <Input {...field("duration")} placeholder="3:45" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="song-year">Year</Label>
          <Input {...field("year")} inputMode="numeric" placeholder="Written or published" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="song-copyright">Copyright</Label>
          <Input {...field("copyright")} placeholder="© 2019 Publisher" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="song-ccli">CCLI</Label>
          <Input {...field("ccli")} inputMode="numeric" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="song-isrc">ISRC</Label>
          <Input {...field("isrc")} placeholder="USRC17607839" />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="song-reference">Reference</Label>
        <Input {...field("reference")} placeholder="E.g. the scripture it draws on: Psalm 23" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="song-notes">Notes</Label>
        <Textarea {...field("notes")} rows={3} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!dirty || saving || !values.title.trim()}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
        {message ? (
          <p className={message.kind === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"} role={message.kind === "error" ? "alert" : "status"}>
            {message.text}
          </p>
        ) : null}
      </div>
    </form>
  );
}
