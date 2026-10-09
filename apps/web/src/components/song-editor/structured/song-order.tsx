import { generateId, ID_PREFIXES, transposeKey, type SectionInstance, type SectionV2 } from "@songverse/core";
import { ArrowLeft, ArrowRight, Copy, Eye, EyeOff, KeyRound, ListRestart, MessageSquare, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "#/components/ui/button";
import { NativeSelect } from "#/components/ui/native-select";
import { cn } from "#/lib/utils";

const KEY_STEPS = [-5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6];

/**
 * The order the song is sung in (docs/song-document-v2.md, "Flow"): each
 * pass through a section, in order, with its own label, key change and
 * note. Sections are stored once; singing one again is another pass here.
 */
export function SongOrder({
  sections,
  flow,
  onChange,
  songKey,
  open,
}: {
  sections: SectionV2[];
  flow: SectionInstance[];
  onChange: (flow: SectionInstance[]) => void;
  songKey: string;
  /** A pass to open (one just added from a section's menu), and when. */
  open?: { id: string; at: number } | null;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    if (open) setSelected(open.id);
  }, [open?.at]);
  const [dragging, setDragging] = useState<number | null>(null);
  const byId = new Map(sections.map((section) => [section.id, section]));
  const nameOf = (section: SectionV2) => section.label || t(`chart.sections.${section.type}`);
  const passes = flow.filter((item) => byId.has(item.sectionId));
  const plain = passes.length === sections.length && passes.every((item, i) => item.sectionId === sections[i]!.id && !item.label && !item.keyChange && !item.note && !changedPass(item));
  const unsung = sections.filter((section) => !passes.some((item) => item.sectionId === section.id));

  // The key in effect before each pass, for naming a key change.
  const keysBefore: (string | null)[] = [];
  let current: string | null = songKey || null;
  for (const item of passes) {
    keysBefore.push(current);
    if (item.keyChange) current = item.keyChange.key;
  }

  const update = (next: SectionInstance[]) => onChange(next);
  const index = passes.findIndex((item) => item.id === selected);
  const pass = index >= 0 ? passes[index]! : null;

  function add(sectionId: string) {
    const item = { id: generateId(ID_PREFIXES.flowItem), sectionId };
    update([...passes, item]);
    setSelected(item.id);
  }
  function move(from: number, to: number) {
    if (to < 0 || to >= passes.length || from === to) return;
    const next = [...passes];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    update(next);
  }
  function edit(change: Partial<SectionInstance>) {
    if (!pass) return;
    update(passes.map((item) => (item.id === pass.id ? { ...item, ...change } : item)));
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3" data-testid="song-order">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("songOrder.title")}</h3>
        {!plain ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto h-7 text-xs"
            onClick={() => {
              update(sections.map((section) => ({ id: generateId(ID_PREFIXES.flowItem), sectionId: section.id })));
              setSelected(null);
            }}
          >
            <ListRestart />
            {t("songOrder.reset")}
          </Button>
        ) : null}
      </div>
      <ol className="flex flex-wrap items-center gap-1.5" aria-label={t("songOrder.title")}>
        {passes.map((item, i) => {
          const section = byId.get(item.sectionId)!;
          return (
            <li
              key={item.id}
              draggable
              onDragStart={(event) => {
                setDragging(i);
                event.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(event) => dragging !== null && event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                if (dragging !== null) move(dragging, i);
                setDragging(null);
              }}
              onDragEnd={() => setDragging(null)}
            >
              <button
                type="button"
                aria-pressed={item.id === selected}
                data-pass-section={section.type}
                onClick={() => setSelected(item.id === selected ? null : item.id)}
                className={cn(
                  "flex items-center gap-1 rounded-md border px-2 py-1 text-xs whitespace-nowrap hover:bg-muted",
                  item.id === selected && "border-primary bg-primary/10",
                  dragging === i && "opacity-40",
                )}
              >
                <span className="text-muted-foreground tabular-nums">{i + 1}</span>
                <span className="font-medium">{item.label || nameOf(section)}</span>
                {item.keyChange ? (
                  <span className="rounded bg-primary/10 px-1 font-mono text-[10px] text-primary">→{item.keyChange.key}</span>
                ) : null}
                {item.note ? <MessageSquare className="size-3 text-muted-foreground" aria-label={t("songOrder.hasNote")} /> : null}
                {/* Its own chords, lines or transposition (issue #205). */}
                {changedPass(item) ? (
                  <span className="font-semibold text-amber-600 dark:text-amber-400" title={t("songOrder.changed")} aria-label={t("songOrder.changed")} data-pass-changed="">
                    *
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
        <li>
          <NativeSelect
            compact
            aria-label={t("songOrder.add")}
            value=""
            onChange={(event) => event.target.value && add(event.target.value)}
            className="h-7 w-auto"
          >
            <option value="">{t("songOrder.addOption")}</option>
            {sections.map((section) => (
              <option key={section.id} value={section.id}>
                {nameOf(section)}
              </option>
            ))}
          </NativeSelect>
        </li>
      </ol>
      {unsung.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {t("songOrder.unsung", { sections: unsung.map(nameOf).join(", ") })}
        </p>
      ) : null}

      {pass ? (
        <div className="flex flex-col gap-2 border-t pt-2" data-testid="song-order-pass">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium">{t("songOrder.pass", { n: index + 1, section: nameOf(byId.get(pass.sectionId)!) })}</span>
            <div className="ml-auto flex items-center">
              <IconButton label={t("songOrder.earlier")} disabled={index === 0} onClick={() => move(index, index - 1)}>
                <ArrowLeft />
              </IconButton>
              <IconButton label={t("songOrder.later")} disabled={index === passes.length - 1} onClick={() => move(index, index + 1)}>
                <ArrowRight />
              </IconButton>
              <IconButton
                label={t("songOrder.again")}
                onClick={() => {
                  const copy = { id: generateId(ID_PREFIXES.flowItem), sectionId: pass.sectionId };
                  update([...passes.slice(0, index + 1), copy, ...passes.slice(index + 1)]);
                  setSelected(copy.id);
                }}
              >
                <Copy />
              </IconButton>
              <IconButton
                label={t("songOrder.remove")}
                onClick={() => {
                  update(passes.filter((item) => item.id !== pass.id));
                  setSelected(null);
                }}
              >
                <Trash2 className="text-destructive" />
              </IconButton>
              <IconButton label={t("songOrder.close")} onClick={() => setSelected(null)}>
                <X />
              </IconButton>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
            <input
              aria-label={t("songOrder.label")}
              placeholder={t("songOrder.labelPlaceholder", { section: nameOf(byId.get(pass.sectionId)!) })}
              value={pass.label ?? ""}
              maxLength={100}
              onChange={(event) => edit({ label: event.target.value || null })}
              className="h-8 min-w-0 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring"
            />
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <KeyRound className="size-3.5" aria-hidden />
              <NativeSelect
                compact
                aria-label={t("songOrder.keyChange")}
                value={pass.keyChange?.steps ?? 0}
                onChange={(event) => {
                  const steps = Number(event.target.value);
                  const before = keysBefore[index];
                  edit({
                    keyChange: steps
                      ? { steps, key: (before && transposeKey(before, steps)) || `${steps > 0 ? "+" : ""}${steps}` }
                      : null,
                  });
                }}
              >
                <option value={0}>{t("songOrder.sameKey")}</option>
                {KEY_STEPS.map((steps) => {
                  const before = keysBefore[index];
                  const key = before ? transposeKey(before, steps) : null;
                  return (
                    <option key={steps} value={steps}>
                      {`${steps > 0 ? "+" : ""}${steps}${key ? ` → ${key}` : ""}`}
                    </option>
                  );
                })}
              </NativeSelect>
            </label>
          </div>
          <input
            aria-label={t("songOrder.note")}
            placeholder={t("songOrder.notePlaceholder")}
            value={pass.note ?? ""}
            maxLength={500}
            onChange={(event) => edit({ note: event.target.value || null })}
            className="h-8 min-w-0 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring"
          />
          <PassChanges pass={pass} section={byId.get(pass.sectionId)!} onChange={edit} />
        </div>
      ) : (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Plus className="size-3" aria-hidden />
          {t("songOrder.hint")}
        </p>
      )}
    </div>
  );
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={label} title={label} disabled={disabled} onClick={onClick}>
      {children}
    </Button>
  );
}

/** Whether a pass differs from its section as written (issue #205): its own chords, only some lines, or moved by itself. */
export function changedPass(item: SectionInstance): boolean {
  return !!item.transpose || (item.chords?.length ?? 0) > 0 || !!item.lines;
}

const TRANSPOSE_STEPS = [-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6];

/**
 * What a pass changes from its section (issue #205), the section itself
 * staying as it is: moved up or down for this pass only, only some of its
 * lines, and its own chords - each chord replaced (written in the song's
 * key) or left out on this pass.
 */
function PassChanges({ pass, section, onChange }: { pass: SectionInstance; section: SectionV2; onChange: (change: Partial<SectionInstance>) => void }) {
  const { t } = useTranslation();
  const lyricLines = section.lines.filter((line) => line.kind !== "note");
  const shortText = (text: string) => (text.length > 40 ? `${text.slice(0, 40)}…` : text || "—");
  const changes = new Map((pass.chords ?? []).map((change) => [change.chordId, change.raw]));
  const setChord = (chordId: string, raw: string | null | undefined) => {
    const next = (pass.chords ?? []).filter((change) => change.chordId !== chordId);
    if (raw !== undefined) next.push({ chordId, raw });
    onChange({ chords: next.length > 0 ? next : undefined });
  };
  const from = pass.lines?.from ?? "";
  const to = pass.lines?.to ?? "";
  const setLines = (next: { from: string; to: string }) => {
    const whole = next.from === lyricLines[0]?.id && next.to === lyricLines.at(-1)?.id;
    onChange({ lines: next.from && next.to && !whole ? next : null });
  };
  return (
    <div className="flex flex-col gap-2 rounded-md bg-muted/40 p-2" data-testid="song-order-changes">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium">{t("songOrder.thisPass")}</span>
        {changedPass(pass) ? (
          <Button type="button" variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={() => onChange({ transpose: null, chords: undefined, lines: null })} data-testid="song-order-as-written">
            <RotateCcw />
            {t("songOrder.asWritten")}
          </Button>
        ) : null}
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="w-28 shrink-0">{t("songOrder.transpose")}</span>
        <NativeSelect compact value={pass.transpose ?? 0} onChange={(event) => onChange({ transpose: Number(event.target.value) || null })} data-testid="song-order-transpose">
          {TRANSPOSE_STEPS.map((steps) => (
            <option key={steps} value={steps}>
              {steps === 0 ? t("songOrder.notTransposed") : `${steps > 0 ? "+" : ""}${steps}`}
            </option>
          ))}
        </NativeSelect>
      </label>
      {lyricLines.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="w-28 shrink-0">{t("songOrder.someLines")}</span>
          <NativeSelect
            compact
            aria-label={t("songOrder.fromLine")}
            value={from}
            onChange={(event) => setLines({ from: event.target.value, to: to || lyricLines.at(-1)!.id })}
            className="min-w-0 flex-1"
            data-testid="song-order-lines-from"
          >
            <option value="">{t("songOrder.wholeSection")}</option>
            {lyricLines.map((line, i) => (
              <option key={line.id} value={line.id}>
                {`${i + 1}. ${shortText(line.text)}`}
              </option>
            ))}
          </NativeSelect>
          {from ? (
            <NativeSelect compact aria-label={t("songOrder.toLine")} value={to} onChange={(event) => setLines({ from, to: event.target.value })} className="min-w-0 flex-1" data-testid="song-order-lines-to">
              {lyricLines.map((line, i) => (
                <option key={line.id} value={line.id} disabled={i < lyricLines.findIndex((one) => one.id === from)}>
                  {`${i + 1}. ${shortText(line.text)}`}
                </option>
              ))}
            </NativeSelect>
          ) : null}
        </div>
      ) : null}
      {section.lines.some((line) => line.chords.length > 0) ? (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{t("songOrder.passChords")}</span>
          {section.lines
            .filter((line) => line.chords.length > 0)
            .map((line) => (
              <div key={line.id} className="flex flex-wrap items-center gap-1.5">
                <span className="w-28 shrink-0 truncate text-xs text-muted-foreground" title={line.text}>
                  {shortText(line.text)}
                </span>
                {line.chords.map((chord) => {
                  const change = changes.get(chord.id);
                  const hidden = change === null;
                  return (
                    <span key={chord.id} className="flex items-center rounded-md border bg-background">
                      <input
                        value={hidden ? "" : (change ?? "")}
                        placeholder={chord.raw}
                        disabled={hidden}
                        maxLength={32}
                        onChange={(event) => setChord(chord.id, event.target.value.trim() ? event.target.value : undefined)}
                        aria-label={t("songOrder.chordOnPass", { chord: chord.raw })}
                        className={cn(
                          "h-7 w-16 rounded-l-md bg-transparent px-1.5 font-mono text-xs font-bold outline-none placeholder:font-normal placeholder:text-muted-foreground",
                          change ? "text-amber-700 dark:text-amber-400" : "text-primary",
                          hidden && "line-through",
                        )}
                        data-testid={`song-order-chord-${chord.id}`}
                      />
                      <button
                        type="button"
                        onClick={() => setChord(chord.id, hidden ? undefined : null)}
                        aria-pressed={hidden}
                        aria-label={hidden ? t("songOrder.showChord", { chord: chord.raw }) : t("songOrder.hideChord", { chord: chord.raw })}
                        title={hidden ? t("songOrder.showChord", { chord: chord.raw }) : t("songOrder.hideChord", { chord: chord.raw })}
                        className="flex h-7 items-center border-l px-1 text-muted-foreground hover:text-foreground [&_svg]:size-3.5"
                        data-testid={`song-order-chord-hide-${chord.id}`}
                      >
                        {hidden ? <EyeOff /> : <Eye />}
                      </button>
                    </span>
                  );
                })}
              </div>
            ))}
        </div>
      ) : null}
    </div>
  );
}
