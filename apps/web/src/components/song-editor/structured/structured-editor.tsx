import {
  detectImportFormat,
  diatonicChords,
  parseChord,
  reconcileSections,
  sameChord,
  SECTION_TYPES,
  sectionsFromText,
  sectionsToChordPro,
  simplifyChord,
  transposeChord,
  transposeKey,
  type SectionInstance,
  type SectionType,
  type SectionV2,
} from "@songverse/core";
import { Placeholder } from "@tiptap/extensions";
import { UndoRedo } from "@tiptap/extensions";
import { NodeSelection } from "@tiptap/pm/state";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { ChevronLeft, ChevronRight, Minus, Plus, Redo2, StickyNote, Trash2, Undo2 } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SongChart } from "#/components/song-chart";
import { Button } from "#/components/ui/button";
import { NativeSelect } from "#/components/ui/native-select";
import { Textarea } from "#/components/ui/textarea";
import { cn } from "#/lib/utils";
import { KEY_OPTIONS } from "../song-form";
import { editorToSections, sameSections, sectionsToEditorJSON } from "./document";
import { startChordDrag } from "./drag";
import { SongOrder } from "./song-order";
import {
  addSection,
  deleteChord,
  insertChord,
  nudgeChord,
  REPLACE_META,
  replaceDocument,
  selectedChord,
  setChordSymbol,
  songEditorExtensions,
  toggleNoteLine,
  transposeChords,
  type ChordViewEvents,
} from "./extensions";

export type EditorMode = "visual" | "text" | "preview";
const MODES: EditorMode[] = ["visual", "text", "preview"];

/**
 * The song editor's Editor tab: the chart edited as it looks - chords above
 * the lyrics, dragged or nudged onto any character, lyrics typed around
 * them - with a text mode for tricky fixes and a preview. Edits the
 * sections' IDs never change (docs/song-document-v2.md, "Editor rules").
 */
export function StructuredEditor({
  sections,
  onChange,
  flow,
  onFlowChange,
  songKey,
  onSongKeyChange,
  readOnly,
}: {
  sections: SectionV2[];
  onChange: (sections: SectionV2[]) => void;
  flow: SectionInstance[];
  onFlowChange: (flow: SectionInstance[]) => void;
  songKey: string;
  onSongKeyChange: (key: string) => void;
  readOnly: boolean;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<EditorMode>(readOnly ? "preview" : "visual");
  const [editTick, setEditTick] = useState(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  // The sections the editor last reported: anything else arriving is an outside change to load.
  const emitted = useRef(sections);

  const events = useRef<ChordViewEvents>({ onChordPointerDown: () => {}, onEditChord: () => {} });
  const extensions = useMemo(
    () => [
      ...songEditorExtensions({
        onChordPointerDown: (event, pos) => events.current.onChordPointerDown(event, pos),
        onEditChord: () => events.current.onEditChord(),
      }),
      UndoRedo,
      Placeholder.configure({ placeholder: t("structuredEditor.placeholder"), includeChildren: true, showOnlyCurrent: false }),
    ],
    [],
  );
  const editor = useEditor({
    extensions,
    content: sectionsToEditorJSON(sections),
    editable: !readOnly,
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editorProps: { attributes: { "aria-label": t("structuredEditor.label"), spellcheck: "false", "data-testid": "structured-editor" } },
    onUpdate: ({ editor: current, transaction }) => {
      if (transaction.getMeta(REPLACE_META)) return;
      const next = editorToSections(current.state.doc);
      emitted.current = next;
      onChangeRef.current(next);
    },
  });

  events.current = {
    onChordPointerDown: (event, pos) => {
      if (!editor) return;
      const raw = (editor.state.doc.nodeAt(pos)?.attrs.raw as string | undefined) ?? "";
      startChordDrag(editor.view, event, { kind: "move", pos, raw }, () => {
        editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)));
        editor.view.focus();
      });
    },
    onEditChord: () => setEditTick((tick) => tick + 1),
  };

  // Load the sections when they change from outside (Song Info's text, Discard, a save, text mode).
  useEffect(() => {
    if (!editor || sameSections(sections, emitted.current)) return;
    emitted.current = sections;
    replaceDocument(editor.view, editor.schema.nodeFromJSON(sectionsToEditorJSON(sections)), mode === "text");
  }, [editor, sections]);

  useEffect(() => {
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);

  if (readOnly) {
    return <SongChart sections={sections} flow={flow} emptyText={t("songEditor.previewEmpty")} />;
  }

  return (
    <div className="flex flex-col gap-3">
      <Toolbar editor={editor} mode={mode} onModeChange={setMode} songKey={songKey} onSongKeyChange={onSongKeyChange} />
      {sections.length > 0 && mode !== "text" ? <SongOrder sections={sections} flow={flow} onChange={onFlowChange} songKey={songKey} /> : null}
      <div className={cn("grid grid-cols-1 gap-4", mode === "visual" && "lg:grid-cols-[13rem_minmax(0,1fr)]")}>
        {mode === "visual" && editor ? <Palette editor={editor} songKey={songKey} sections={sections} /> : null}
        <div className={cn("relative min-w-0", mode !== "visual" && "hidden")} data-editor-container="">
          <EditorContent editor={editor} className="sv-editor" />
          {editor ? <ChordPopover editor={editor} songKey={songKey} editTick={editTick} /> : null}
          <p className="mt-4 text-xs text-muted-foreground">{t("structuredEditor.hints")}</p>
        </div>
        {mode === "text" ? <TextMode sections={sections} onChange={(next) => onChangeRef.current(next)} /> : null}
        {mode === "preview" ? <SongChart sections={sections} flow={flow} emptyText={t("songEditor.previewEmpty")} /> : null}
      </div>
    </div>
  );
}

function Toolbar({
  editor,
  mode,
  onModeChange,
  songKey,
  onSongKeyChange,
}: {
  editor: Editor | null;
  mode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
  songKey: string;
  onSongKeyChange: (key: string) => void;
}) {
  const { t } = useTranslation();
  const can = useEditorState({
    editor,
    selector: ({ editor: current }) => ({ undo: !!current?.can().undo(), redo: !!current?.can().redo() }),
  }) ?? { undo: false, redo: false };

  function transpose(steps: number) {
    if (!editor) return;
    const key = songKey ? (transposeKey(songKey, steps) ?? songKey) : null;
    transposeChords(editor.view, (raw) => transposeChord(raw, steps, key));
    if (key) onSongKeyChange(key);
  }

  const visual = mode === "visual";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="radiogroup" aria-label={t("structuredEditor.mode")} className="inline-flex rounded-md border p-0.5">
        {MODES.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={mode === option}
            onClick={() => onModeChange(option)}
            className={cn(
              "rounded-sm px-2.5 py-1 text-xs font-medium",
              mode === option ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {t(`structuredEditor.modes.${option}`)}
          </button>
        ))}
      </div>
      {visual ? (
        <>
          <div className="flex items-center">
            <ToolButton label={t("structuredEditor.undo")} disabled={!can.undo} onClick={() => editor?.chain().focus().undo().run()}>
              <Undo2 />
            </ToolButton>
            <ToolButton label={t("structuredEditor.redo")} disabled={!can.redo} onClick={() => editor?.chain().focus().redo().run()}>
              <Redo2 />
            </ToolButton>
          </div>
          <ToolButton label={t("structuredEditor.noteLine")} onClick={() => editor && toggleNoteLine(editor.view)}>
            <StickyNote />
          </ToolButton>
        </>
      ) : null}
      <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
        {t("structuredEditor.key")}
        <NativeSelect compact aria-label={t("structuredEditor.key")} value={songKey} onChange={(event) => onSongKeyChange(event.target.value)} className="w-20">
          <option value="">–</option>
          {[...KEY_OPTIONS.major, ...KEY_OPTIONS.minor].map((key) => (
            <option key={key} value={key}>
              {key}
            </option>
          ))}
        </NativeSelect>
      </label>
      {visual ? (
        <div className="flex items-center gap-0.5" role="group" aria-label={t("structuredEditor.transpose")}>
          <ToolButton label={t("structuredEditor.transposeDown")} onClick={() => transpose(-1)}>
            <Minus />
          </ToolButton>
          <span className="text-xs text-muted-foreground">{t("structuredEditor.transpose")}</span>
          <ToolButton label={t("structuredEditor.transposeUp")} onClick={() => transpose(1)}>
            <Plus />
          </ToolButton>
        </div>
      ) : null}
    </div>
  );
}

function ToolButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={label} title={label} disabled={disabled} onClick={onClick}>
      {children}
    </Button>
  );
}

/** A chord to add: click for the cursor (or to replace the selected chord), drag onto a lyric. */
function PaletteChord({ editor, raw, degree }: { editor: Editor; raw: string; degree?: string }) {
  const apply = () => {
    const selected = selectedChord(editor.state);
    if (selected) setChordSymbol(editor.view, selected.pos, raw);
    else insertChord(editor.view, raw);
  };
  return (
    <button
      type="button"
      className="flex shrink-0 touch-pan-x items-baseline gap-1 rounded-md border px-2 py-1 font-mono text-sm font-bold text-primary hover:bg-primary/10"
      data-palette-chord={raw}
      onMouseDown={(event) => event.preventDefault()}
      onPointerDown={(event) => startChordDrag(editor.view, event.nativeEvent, { kind: "new", raw }, apply)}
      // Keyboard activation (a pointer press is handled above).
      onClick={(event) => event.detail === 0 && apply()}
    >
      {raw}
      {degree ? <span className="font-sans text-[10px] font-normal text-muted-foreground">{degree}</span> : null}
    </button>
  );
}

function Palette({ editor, songKey, sections }: { editor: Editor; songKey: string; sections: SectionV2[] }) {
  const { t } = useTranslation();
  const [other, setOther] = useState("");
  const inKey = diatonicChords(songKey);
  const used = [...new Set(sections.flatMap((section) => section.lines.flatMap((line) => line.chords.map((chord) => chord.raw))))];

  function addOther() {
    if (!other.trim()) return;
    const selected = selectedChord(editor.state);
    if (selected) setChordSymbol(editor.view, selected.pos, other);
    else insertChord(editor.view, other);
    setOther("");
  }

  const heading = "text-xs font-semibold tracking-wide text-muted-foreground uppercase";
  const row = "flex gap-1.5 overflow-x-auto pb-1 lg:flex-wrap lg:overflow-visible";
  return (
    <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-24 lg:self-start" aria-label={t("structuredEditor.palette")}>
      <div className="flex flex-col gap-1.5">
        <h3 className={heading}>{t("structuredEditor.sections")}</h3>
        <div className={row}>
          {SECTION_TYPES.map((type: SectionType) => (
            <button
              key={type}
              type="button"
              className="flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted"
              onClick={() => addSection(editor.view, type)}
              aria-label={t("structuredEditor.addSection", { type: t(`chart.sections.${type}`) })}
            >
              <Plus className="size-3" aria-hidden />
              {t(`chart.sections.${type}`)}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <h3 className={heading}>{songKey && inKey.length > 0 ? t("structuredEditor.inKey", { key: songKey }) : t("structuredEditor.chords")}</h3>
        {inKey.length > 0 ? (
          <div className={row}>
            {inKey.map((chord) => (
              <PaletteChord key={chord.degree} editor={editor} raw={chord.chord} degree={chord.degree} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{t("structuredEditor.setKeyHint")}</p>
        )}
        {used.length > 0 ? (
          <>
            <h4 className="mt-1 text-xs text-muted-foreground">{t("structuredEditor.inSong")}</h4>
            <div className={row}>
              {used.map((raw) => (
                <PaletteChord key={raw} editor={editor} raw={raw} />
              ))}
            </div>
          </>
        ) : null}
        <div className="mt-1 flex gap-1.5">
          <input
            value={other}
            onChange={(event) => setOther(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addOther();
              }
            }}
            placeholder={t("structuredEditor.otherChord")}
            aria-label={t("structuredEditor.otherChord")}
            maxLength={64}
            className="h-8 w-full min-w-0 rounded-md border border-input bg-transparent px-2 font-mono text-sm outline-none focus-visible:border-ring"
          />
          <Button type="button" size="sm" variant="outline" onClick={addOther} disabled={!other.trim()}>
            {t("structuredEditor.addChord")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t("structuredEditor.chordHint")}</p>
      </div>
    </aside>
  );
}

const VARIATIONS = ["", "m", "7", "maj7", "m7", "sus2", "sus4", "add9"];

/** The selected chord's details, just under it: its symbol, the key's chords, variations, move and delete. */
function ChordPopover({ editor, songKey, editTick }: { editor: Editor; songKey: string; editTick: number }) {
  const { t } = useTranslation();
  const chord = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const selected = current ? selectedChord(current.state) : null;
      return selected ? { pos: selected.pos, raw: selected.node.attrs.raw as string, id: selected.node.attrs.id as string } : null;
    },
    equalityFn: (a, b) => a?.pos === b?.pos && a?.raw === b?.raw && a?.id === b?.id,
  });
  const [draft, setDraft] = useState("");
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => setDraft(chord?.raw ?? ""), [chord?.id, chord?.raw]);
  useEffect(() => {
    if (editTick > 0) input.current?.select();
  }, [editTick]);

  useLayoutEffect(() => {
    if (!chord) return;
    const measure = () => {
      const chip = (editor.view.nodeDOM(chord.pos) as HTMLElement | null)?.querySelector(".sv-chord-chip");
      const container = box.current?.parentElement;
      if (!chip || !container) return;
      const [c, r] = [container.getBoundingClientRect(), chip.getBoundingClientRect()];
      const width = box.current?.offsetWidth ?? 288;
      setPlace({ top: r.bottom - c.top + 26, left: Math.max(0, Math.min(r.left - c.left, c.width - width)) });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [editor, chord?.pos, chord?.raw]);

  if (!chord) return null;
  const view = editor.view;
  const apply = (raw: string) => setChordSymbol(view, chord.pos, raw);
  const inKey = diatonicChords(songKey);
  const triad = simplifyChord(chord.raw, { dropExtensions: true, dropBass: true });
  const degree = inKey.find((option) => sameChord(option.chord, triad))?.degree;
  const root = /^\(?([A-G][#b]?)/.exec(chord.raw)?.[1];
  const variations = root ? VARIATIONS.map((suffix) => root + suffix).filter((raw) => raw !== chord.raw) : [];
  const valid = !!parseChord(draft);

  const chip = (raw: string, sub?: string) => (
    <button
      key={raw}
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => apply(raw)}
      className={cn(
        "flex items-baseline gap-1 rounded border px-1.5 py-0.5 font-mono text-xs font-bold hover:bg-primary/10",
        sameChord(raw, chord.raw) ? "border-primary bg-primary/10 text-primary" : "text-foreground",
      )}
    >
      {raw}
      {sub ? <span className="font-sans text-[10px] font-normal text-muted-foreground">{sub}</span> : null}
    </button>
  );

  return (
    <div
      ref={box}
      role="dialog"
      aria-label={t("structuredEditor.chordDetails", { chord: chord.raw })}
      data-testid="chord-popover"
      className="absolute z-20 flex w-72 max-w-full flex-col gap-2.5 rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg"
      style={place ? { top: place.top, left: place.left } : { visibility: "hidden" }}
      onMouseDown={(event) => {
        if (!(event.target instanceof HTMLInputElement)) event.preventDefault();
      }}
    >
      <div className="flex items-center gap-2">
        <input
          ref={input}
          value={draft}
          aria-label={t("structuredEditor.chordSymbol")}
          maxLength={64}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => draft.trim() && apply(draft)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (draft.trim()) apply(draft);
              view.focus();
            } else if (event.key === "Escape") {
              setDraft(chord.raw);
              view.focus();
            }
          }}
          className={cn(
            "h-8 w-24 min-w-0 rounded-md border bg-transparent px-2 font-mono text-sm font-bold outline-none focus-visible:border-ring",
            !valid && draft.trim() && "border-amber-500",
          )}
        />
        {degree ? <span className="text-xs text-muted-foreground">{t("structuredEditor.degree", { degree, key: songKey })}</span> : null}
        <div className="ml-auto flex items-center">
          <ToolButton label={t("structuredEditor.moveLeft")} onClick={() => nudgeChord(view, chord.pos, -1)}>
            <ChevronLeft />
          </ToolButton>
          <ToolButton label={t("structuredEditor.moveRight")} onClick={() => nudgeChord(view, chord.pos, 1)}>
            <ChevronRight />
          </ToolButton>
          <ToolButton label={t("structuredEditor.deleteChord")} onClick={() => deleteChord(view, chord.pos)}>
            <Trash2 className="text-destructive" />
          </ToolButton>
        </div>
      </div>
      {!valid && draft.trim() ? <p className="text-xs text-amber-600">{t("structuredEditor.unknownChord")}</p> : null}
      {inKey.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{t("structuredEditor.inKey", { key: songKey })}</span>
          <div className="flex flex-wrap gap-1">{inKey.map((option) => chip(option.chord, option.degree))}</div>
        </div>
      ) : null}
      {variations.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{t("structuredEditor.variations")}</span>
          <div className="flex flex-wrap gap-1">{variations.map((raw) => chip(raw))}</div>
        </div>
      ) : null}
    </div>
  );
}

/** The chart as ChordPro text; each change is read back with the IDs kept (reconcileSections). */
function TextMode({ sections, onChange }: { sections: SectionV2[]; onChange: (sections: SectionV2[]) => void }) {
  const { t } = useTranslation();
  // What the text started from: every change is matched against it, so IDs survive a round of edits.
  const base = useRef(sections);
  const [text, setText] = useState(() => sectionsToChordPro(sections));
  const [problem, setProblem] = useState(false);

  function change(next: string) {
    setText(next);
    try {
      onChange(reconcileSections(base.current, sectionsFromText(next, detectImportFormat(next))));
      setProblem(false);
    } catch {
      setProblem(true);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Textarea
        value={text}
        onChange={(event) => change(event.target.value)}
        rows={24}
        spellCheck={false}
        aria-label={t("structuredEditor.textLabel")}
        data-testid="structured-editor-text"
        className="min-h-60 font-mono text-sm"
      />
      <p className={cn("text-xs", problem ? "text-destructive" : "text-muted-foreground")} role={problem ? "alert" : undefined}>
        {problem ? t("structuredEditor.textProblem") : t("structuredEditor.textHint")}
      </p>
    </div>
  );
}
