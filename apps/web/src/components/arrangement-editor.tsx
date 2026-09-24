import {
  layoutChordLine,
  TRANSPOSE_STEP_OPTIONS,
  transposeChord,
  transposeKey,
  type ArrangementDetail,
  type ArrangementDocumentV2,
  type ArrangementItemV2,
  type OverrideV2,
  type SectionInstance,
  type SongDocumentV2,
  type SetlistSummary,
  type SongVersionDetail,
} from "@songverse/core";
import { Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, Eye, EyeOff, MessageSquare, RotateCcw, Star } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmButton } from "#/components/confirm-button";
import { nameKeyChanges } from "#/components/song-editor/song-form";
import { SongOrder } from "#/components/song-editor/structured/song-order";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { NativeSelect } from "#/components/ui/native-select";
import { Textarea } from "#/components/ui/textarea";
import { apiClient } from "#/lib/api-client";
import { setlistTitle, transposeLabel } from "#/lib/setlists";
import { cn } from "#/lib/utils";

type Item = ArrangementItemV2;
const CAPOS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/**
 * Editing an arrangement (docs/arrangement-document-v2.md): its order, key,
 * capo and tempo, and on each pass the song's chords replaced or hidden,
 * lines hidden and notes added - the song itself never changes. Chords are
 * shown and typed in the key the pass is played in, and stored in the
 * song's key. Changing a line's words and adding lines come later (#24).
 */
export function ArrangementEditor({
  initial,
  version,
  set,
}: {
  initial: ArrangementDetail;
  version: SongVersionDetail;
  /** The set it's for, when it's one song's own arrangement for a set. */
  set: Pick<SetlistSummary, "id" | "name" | "eventDate"> | null;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const song = version.documentJson;
  const [detail, setDetail] = useState(initial);
  const [doc, setDoc] = useState<ArrangementDocumentV2>(initial.document);
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const readOnly = !detail.canEdit;
  const sectionIds = useMemo(() => new Set(song.sections.map((section) => section.id)), [song.sections]);
  const songKey = song.defaults.key ?? null;
  const steps = doc.defaults.transposeSteps ?? 0;
  const arrangementKey = songKey ? (transposeKey(songKey, steps) ?? songKey) : "";
  const dirty =
    JSON.stringify(doc) !== JSON.stringify(detail.document) || name.trim() !== detail.name || description.trim() !== (detail.description ?? "");

  function change(next: ArrangementDocumentV2) {
    setDoc(next);
    setMessage(null);
  }
  const setDefaults = (patch: Partial<ArrangementDocumentV2["defaults"]>) => change({ ...doc, defaults: { ...doc.defaults, ...patch } });
  const setItem = (next: Item) => change({ ...doc, items: doc.items.map((item) => (item.id === next.id ? next : item)) });

  async function run(action: () => Promise<ArrangementDetail>, done: string) {
    setSaving(true);
    setMessage(null);
    try {
      const updated = await action();
      setDetail(updated);
      setDoc(updated.document);
      setName(updated.name);
      setDescription(updated.description ?? "");
      setMessage({ kind: "ok", text: done });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  }
  const save = () =>
    run(
      () => apiClient.updateArrangement(detail.id, { name: name.trim(), description: description.trim() || null, document: doc, updatedAt: detail.updatedAt }),
      t("arrangements.saved"),
    );

  // The key each pass is played in: the arrangement's, plus key changes so far.
  const passSteps = useMemo(() => {
    let current = steps;
    return doc.items.map((item) => (current += item.keyChange?.steps ?? 0));
  }, [doc.items, steps]);

  return (
    <div className="flex flex-col gap-6">
      {set ? (
        <Link
          to="/sets/$setlistId"
          params={{ setlistId: set.id }}
          className="flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {setlistTitle(set, t, i18n.language)}
        </Link>
      ) : (
        <Link
          to="/library/$songVersionId"
          params={{ songVersionId: version.id }}
          search={{ tab: "arrangements" }}
          className="flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {version.title}
        </Link>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {readOnly ? (
            <h1 className="text-2xl font-semibold">{detail.name}</h1>
          ) : (
            <Input
              aria-label={t("arrangements.name")}
              value={name}
              maxLength={100}
              onChange={(event) => setName(event.target.value)}
              className="h-10 max-w-md text-xl font-semibold"
            />
          )}
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {t("arrangements.of", { title: version.title })} ·{" "}
            {set ? t("arrangements.forSet", { set: setlistTitle(set, t, i18n.language) }) : (detail.teamName ?? t("arrangements.mine"))}
            {detail.isTeamDefault ? (
              <Badge variant="muted" className="gap-1">
                <Star className="size-3" aria-hidden />
                {t("arrangements.usual")}
              </Badge>
            ) : null}
          </p>
        </div>
        {readOnly ? null : (
          <div className="flex flex-wrap items-center gap-2">
            {detail.ownerScope === "TEAM" && !detail.setlistId ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={saving}
                onClick={() =>
                  void run(
                    () => apiClient.updateArrangement(detail.id, { isTeamDefault: !detail.isTeamDefault, updatedAt: detail.updatedAt }),
                    detail.isTeamDefault ? t("arrangements.noLongerUsual") : t("arrangements.nowUsual", { team: detail.teamName }),
                  )
                }
              >
                <Star />
                {detail.isTeamDefault ? t("arrangements.unmarkUsual") : t("arrangements.markUsual", { team: detail.teamName })}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              disabled={!dirty || saving}
              onClick={() => {
                setDoc(detail.document);
                setName(detail.name);
                setDescription(detail.description ?? "");
                setMessage(null);
              }}
            >
              {t("arrangements.discard")}
            </Button>
            <Button type="button" disabled={!dirty || saving || !name.trim()} onClick={() => void save()}>
              {saving ? t("arrangements.saving") : t("arrangements.save")}
            </Button>
          </div>
        )}
        {message ? (
          <p className={cn("basis-full text-sm", message.kind === "error" ? "text-destructive" : "text-muted-foreground")} role={message.kind === "error" ? "alert" : "status"}>
            {message.text}
          </p>
        ) : null}
      </div>

      {detail.needsReview || detail.problems.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-500/50 bg-amber-500/5 p-4 text-sm" data-testid="review-banner">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4 text-amber-600" aria-hidden />
            {detail.needsReview ? t("arrangements.reviewTitle") : t("arrangements.problemsTitle")}
          </p>
          <p className="text-muted-foreground">
            {detail.needsReview ? t("arrangements.reviewDescription") : null}
            {detail.needsReview && detail.problems.length > 0 ? " " : null}
            {detail.problems.length > 0 ? t("arrangements.problemsDescription", { count: detail.problems.length }) : null}
          </p>
          {readOnly || !detail.needsReview ? null : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              disabled={saving || dirty}
              onClick={() => void run(() => apiClient.markArrangementReviewed(detail.id), t("arrangements.reviewed"))}
            >
              {t("arrangements.markReviewed")}
            </Button>
          )}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <Card className="self-start">
          <CardHeader>
            <CardTitle className="text-sm">{t("arrangements.settings")}</CardTitle>
          </CardHeader>
          <CardContent>
            <fieldset disabled={readOnly} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="arrangement-key">{t("arrangements.key")}</Label>
                <NativeSelect
                  id="arrangement-key"
                  value={steps}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    const key = songKey ? (transposeKey(songKey, next) ?? songKey) : "";
                    change({ ...doc, defaults: { ...doc.defaults, transposeSteps: next }, items: nameKeyChanges(doc.items, key) as Item[] });
                  }}
                >
                  {TRANSPOSE_STEP_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {transposeLabel(songKey, option, t)}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="arrangement-capo">{t("arrangements.capoLabel")}</Label>
                <NativeSelect id="arrangement-capo" value={doc.defaults.capo ?? 0} onChange={(event) => setDefaults({ capo: Number(event.target.value) || null })}>
                  {CAPOS.map((capo) => (
                    <option key={capo} value={capo}>
                      {capo ? t("arrangements.capo", { capo }) : t("arrangements.noCapo")}
                    </option>
                  ))}
                </NativeSelect>
                {!doc.defaults.capo && version.capo ? (
                  <p className="text-xs text-muted-foreground">{t("arrangements.songSuggestsCapo", { capo: version.capo })}</p>
                ) : null}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="arrangement-tempo">{t("arrangements.tempo")}</Label>
                <Input
                  id="arrangement-tempo"
                  type="number"
                  min={20}
                  max={400}
                  value={doc.defaults.tempo ?? ""}
                  placeholder={song.defaults.tempo ? String(song.defaults.tempo) : ""}
                  onChange={(event) => setDefaults({ tempo: event.target.value ? Number(event.target.value) : null })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="arrangement-description">{t("arrangements.descriptionLabel")}</Label>
                <Textarea id="arrangement-description" rows={3} maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} />
              </div>
              {readOnly ? null : (
                <ConfirmButton
                  label={t("arrangements.delete")}
                  confirmLabel={t("arrangements.deleteConfirm")}
                  busyLabel={t("arrangements.deleting")}
                  cancelLabel={t("arrangements.cancel")}
                  onConfirm={async () => {
                    await apiClient.deleteArrangement(detail.id);
                    if (set) await navigate({ to: "/sets/$setlistId", params: { setlistId: set.id } });
                    else await navigate({ to: "/library/$songVersionId", params: { songVersionId: version.id }, search: { tab: "arrangements" } });
                  }}
                />
              )}
            </fieldset>
          </CardContent>
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          {readOnly ? null : (
            <SongOrder
              sections={song.sections}
              // Passes whose section was deleted from the song are kept (see PassEditor) but can't be reordered.
              flow={doc.items.filter((item) => sectionIds.has(item.sectionId))}
              onChange={(flow: SectionInstance[]) =>
                change({
                  ...doc,
                  items: [
                    ...(nameKeyChanges(flow, arrangementKey).map((item) => ({ overrides: [], ...item })) as Item[]),
                    ...doc.items.filter((item) => !sectionIds.has(item.sectionId)),
                  ],
                })
              }
              songKey={arrangementKey}
            />
          )}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t("arrangements.passes")}</CardTitle>
              <CardDescription>{readOnly ? t("arrangements.readOnly") : t("arrangements.passesHint")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              {doc.items.map((item, i) => (
                <PassEditor
                  key={item.id}
                  item={item}
                  song={song}
                  steps={passSteps[i]!}
                  readOnly={readOnly}
                  onChange={setItem}
                  onRemove={() => change({ ...doc, items: doc.items.filter((other) => other.id !== item.id) })}
                />
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// --- one pass

const without = (item: Item, drop: (override: OverrideV2) => boolean): OverrideV2[] => item.overrides.filter((override) => !drop(override));

function PassEditor({
  item,
  song,
  steps,
  readOnly,
  onChange,
  onRemove,
}: {
  item: Item;
  song: SongDocumentV2;
  steps: number;
  readOnly: boolean;
  onChange: (item: Item) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const [chord, setChord] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [noteLine, setNoteLine] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const section = song.sections.find((candidate) => candidate.id === item.sectionId);
  if (!section) {
    // Its section was deleted from the song: shown until the owner removes the pass.
    return (
      <div data-pass-editor={item.id} className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 p-3 text-sm">
        <AlertTriangle className="size-4 text-destructive" aria-hidden />
        <span className="flex-1">{t("arrangements.sectionGone")}</span>
        {readOnly ? null : (
          <Button type="button" size="sm" variant="outline" onClick={onRemove}>
            {t("arrangements.removePass")}
          </Button>
        )}
      </div>
    );
  }
  const songKey = song.defaults.key ?? null;
  const key = songKey ? (transposeKey(songKey, steps) ?? songKey) : null;
  const shown = (raw: string) => transposeChord(raw, steps, key);
  // Changes whose chord or line was deleted from the song since: listed, never dropped silently.
  const lineIds = new Set(section.lines.map((line) => line.id));
  const chordIds = new Set([
    ...section.lines.flatMap((line) => line.chords.map((c) => c.id)),
    ...item.overrides.flatMap((o) => (o.type === "insert_line" ? o.line.chords.map((c) => c.id) : [])),
  ]);
  const stale = item.overrides.filter((o) =>
    o.type === "chord" || o.type === "hide_chord" ? !chordIds.has(o.chordId) : o.type === "insert_line" ? !!o.afterLineId && !lineIds.has(o.afterLineId) : !lineIds.has(o.lineId),
  );
  const replaced = new Map(item.overrides.flatMap((o) => (o.type === "chord" ? [[o.chordId, o.raw] as const] : [])));
  const hiddenChords = new Set(item.overrides.flatMap((o) => (o.type === "hide_chord" ? [o.chordId] : [])));
  const hiddenLines = new Set(item.overrides.flatMap((o) => (o.type === "hide_line" ? [o.lineId] : [])));
  const notes = new Map(item.overrides.flatMap((o) => (o.type === "performance_note" ? [[o.lineId, o.note] as const] : [])));
  const heading = item.label || section.label || t(`chart.sections.${section.type}`);
  const set = (overrides: OverrideV2[]) => onChange({ ...item, overrides });

  const selected = chord ? section.lines.flatMap((line) => line.chords).find((c) => c.id === chord) : null;
  function replaceChord(raw: string | null) {
    if (!selected) return;
    // Typed in the key this pass is played in; stored in the song's key.
    const stored = raw ? transposeChord(raw.trim(), -steps, songKey) : null;
    const rest = without(item, (o) => o.type === "chord" && o.chordId === selected.id);
    set(stored && stored !== selected.raw ? [...rest, { type: "chord", chordId: selected.id, raw: stored }] : rest);
    setChord(null);
  }

  return (
    <div data-pass-editor={item.id} className={cn(item.overrides.length > 0 && "-ml-3 border-l-2 border-amber-500/70 pl-2.5")}>
      <p className="mb-1 flex flex-wrap items-baseline gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        <span>{heading}</span>
        {item.keyChange ? <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary normal-case">{t("chart.keyChange", { key: key ?? item.keyChange.key })}</span> : null}
        {item.overrides.length > 0 ? <span className="font-normal text-amber-700 normal-case dark:text-amber-400">{t("chart.differs")}</span> : null}
      </p>
      {item.note ? <p className="mb-1 text-xs text-muted-foreground italic">{item.note}</p> : null}
      <div className="flex flex-col gap-1 font-mono text-sm">
        {section.lines.map((line) => {
          const hidden = hiddenLines.has(line.id);
          const words = layoutChordLine(
            line.text,
            line.chords.map((c) => ({ at: c.at, id: c.id, label: shown(replaced.get(c.id) ?? c.raw) })),
          );
          return (
            <div key={line.id} className="group flex items-start gap-1" data-line-id={line.id}>
              <p className={cn("min-w-0 flex-1", hidden && "text-muted-foreground line-through opacity-50")}>
                {line.kind === "note" ? (
                  <span className="font-sans text-xs italic">{line.text}</span>
                ) : (
                  words.map((word, w) => (
                    <Fragment key={w}>
                      {w > 0 ? "​" : null}
                      <span className="inline-flex whitespace-pre">
                        {word.map((cell, c) => {
                          const width = cell.chord ? cell.chord.length + 1 : 0;
                          return (
                            <span key={c} className="inline-flex flex-col" style={width ? { minWidth: `${width}ch` } : undefined}>
                              <span className="font-bold text-primary">
                                {cell.chords.length === 0
                                  ? " "
                                  : cell.chords.map((part, k) => (
                                      <Fragment key={part.id}>
                                        {k > 0 ? " " : null}
                                        <button
                                          type="button"
                                          disabled={readOnly || hidden}
                                          data-arr-chord={part.label}
                                          aria-pressed={chord === part.id}
                                          onClick={() => {
                                            setChord(chord === part.id ? null : part.id!);
                                            setDraft(part.label);
                                          }}
                                          className={cn(
                                            "rounded-sm enabled:hover:bg-primary/10",
                                            chord === part.id && "bg-primary text-primary-foreground",
                                            replaced.has(part.id!) && "underline decoration-amber-500 decoration-2",
                                            hiddenChords.has(part.id!) && "text-muted-foreground line-through opacity-50",
                                          )}
                                        >
                                          {part.label}
                                        </button>
                                      </Fragment>
                                    ))}
                              </span>
                              <span>{cell.text}</span>
                            </span>
                          );
                        })}
                      </span>
                    </Fragment>
                  ))
                )}
                {notes.get(line.id) ? <span className="ml-2 font-sans text-xs text-amber-700 italic dark:text-amber-400">{notes.get(line.id)}</span> : null}
              </p>
              {readOnly ? null : (
                <span className="flex shrink-0 items-center gap-0.5 opacity-60 group-hover:opacity-100">
                  <button
                    type="button"
                    className="rounded p-1 hover:bg-muted"
                    aria-label={hidden ? t("arrangements.showLine") : t("arrangements.hideLine")}
                    title={hidden ? t("arrangements.showLine") : t("arrangements.hideLine")}
                    onClick={() =>
                      set(hidden ? without(item, (o) => o.type === "hide_line" && o.lineId === line.id) : [...item.overrides, { type: "hide_line", lineId: line.id }])
                    }
                  >
                    {hidden ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                  </button>
                  <button
                    type="button"
                    className="rounded p-1 hover:bg-muted"
                    aria-label={t("arrangements.lineNote")}
                    title={t("arrangements.lineNote")}
                    onClick={() => {
                      setNoteLine(noteLine === line.id ? null : line.id);
                      setNoteDraft(notes.get(line.id) ?? "");
                    }}
                  >
                    <MessageSquare className="size-3.5" />
                  </button>
                </span>
              )}
            </div>
          );
        })}
      </div>

      {stale.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1 text-xs" data-testid="stale-changes">
          {stale.map((override, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2 text-destructive">
              <AlertTriangle className="size-3" aria-hidden />
              <span>
                {override.type === "chord"
                  ? t("arrangements.stale.chord", { chord: shown(override.raw) })
                  : override.type === "hide_chord"
                    ? t("arrangements.stale.hideChord")
                    : override.type === "hide_line"
                      ? t("arrangements.stale.hideLine")
                      : override.type === "performance_note"
                        ? t("arrangements.stale.note", { note: override.note })
                        : t("arrangements.stale.other")}
              </span>
              {readOnly ? null : (
                <Button type="button" size="sm" variant="ghost" className="h-6 px-2" onClick={() => set(item.overrides.filter((o) => o !== override))}>
                  {t("arrangements.removeChange")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {selected ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm" data-testid="chord-override">
          <span className="text-xs text-muted-foreground">{t("arrangements.chordOnPass", { chord: shown(selected.raw) })}</span>
          <form
            className="flex items-center gap-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              replaceChord(draft);
            }}
          >
            <Input
              aria-label={t("arrangements.replaceWith")}
              value={draft}
              maxLength={64}
              onChange={(event) => setDraft(event.target.value)}
              className="h-8 w-24 font-mono"
              autoFocus
            />
            <Button type="submit" size="sm" variant="outline">
              {t("arrangements.replace")}
            </Button>
          </form>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              const isHidden = hiddenChords.has(selected.id);
              set(isHidden ? without(item, (o) => o.type === "hide_chord" && o.chordId === selected.id) : [...item.overrides, { type: "hide_chord", chordId: selected.id }]);
              setChord(null);
            }}
          >
            {hiddenChords.has(selected.id) ? <Eye /> : <EyeOff />}
            {hiddenChords.has(selected.id) ? t("arrangements.showChord") : t("arrangements.hideChord")}
          </Button>
          {replaced.has(selected.id) ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => replaceChord(null)}>
              <RotateCcw />
              {t("arrangements.asInSong")}
            </Button>
          ) : null}
        </div>
      ) : null}

      {noteLine ? (
        <form
          className="mt-2 flex flex-wrap items-center gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            const rest = without(item, (o) => o.type === "performance_note" && o.lineId === noteLine);
            set(noteDraft.trim() ? [...rest, { type: "performance_note", lineId: noteLine, note: noteDraft.trim() }] : rest);
            setNoteLine(null);
          }}
        >
          <Input
            aria-label={t("arrangements.lineNote")}
            value={noteDraft}
            maxLength={500}
            placeholder={t("arrangements.lineNotePlaceholder")}
            onChange={(event) => setNoteDraft(event.target.value)}
            className="h-8 max-w-sm"
            autoFocus
          />
          <Button type="submit" size="sm" variant="outline">
            {t("arrangements.setNote")}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
