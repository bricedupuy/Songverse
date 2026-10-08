import {
  DISPLAY_TEXT_SIZES,
  TUNINGS,
  type AppModeValue,
  type ChordDiagramsValue,
  type DiagramPlayer,
  type DisplayColumnsValue,
  type EffectiveDisplaySettings,
} from "@songverse/core";
import {
  Baseline,
  Columns2,
  Columns3,
  Ear,
  Eye,
  EyeOff,
  FoldVertical,
  Guitar,
  Hand,
  LayoutGrid,
  Minus,
  Music,
  Palette,
  Plus,
  RectangleVertical,
  RotateCcw,
  Rows3,
  SlidersHorizontal,
  Type,
  UnfoldVertical,
  X,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "#/components/ui/button";
import { ButtonGroup } from "#/components/ui/button-group";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle, DrawerTrigger } from "#/components/ui/drawer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { changeDiagramPlayer, changeDisplaySettings, stepTextSize } from "#/lib/display-settings";
import { cn } from "#/lib/utils";

const SECTIONS = ["text", "chords", "instrument", "layout"] as const;
type Section = (typeof SECTIONS)[number];
const SECTION_ICONS: Record<Section, LucideIcon> = { text: Type, chords: Music, instrument: Guitar, layout: Columns3 };

const KEY = "songverse.display.section";

function keptSection(): Section {
  try {
    const kept = localStorage.getItem(KEY);
    return (SECTIONS as readonly string[]).includes(kept ?? "") ? (kept as Section) : "text";
  } catch {
    return "text";
  }
}

/**
 * The Display panel (issue #209): how charts read in this mode - text,
 * chords, the instrument's diagrams, the layout - in a small drawer at the
 * bottom that leaves the page usable behind it, so each change shows on the
 * chart as it's made. Saved for the mode (Edit, Practice or Live); the
 * instrument's tuning and hands are the account's, for every mode.
 */
export function DisplayPanel({
  mode,
  settings,
  player,
  className,
  compact = false,
}: {
  mode: AppModeValue;
  settings: EffectiveDisplaySettings;
  /** The account's diagram options (tunings, left-handed, piano). */
  player?: DiagramPlayer;
  className?: string;
  /** An icon only, for a crowded toolbar. */
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const [section, setSection] = useState<Section>(keptSection);
  const modeName = t(`mode.${mode.toLowerCase()}`);
  const change = (next: Parameters<typeof changeDisplaySettings>[1]) => changeDisplaySettings(mode, next);

  function pick(next: Section) {
    setSection(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Storage blocked: for this page only.
    }
  }

  return (
    <Drawer modal={false} disablePointerDismissal>
      <DrawerTrigger
        render={<Button variant="outline" size={compact ? "icon" : "sm"} className={cn(compact && "size-8", className)} />}
        aria-label={t("display.open")}
        title={t("display.open")}
        data-testid="display-open"
      >
        <SlidersHorizontal aria-hidden />
        {compact ? null : t("display.open")}
      </DrawerTrigger>
      <DrawerContent data-testid="display-panel" data-mode={mode} aria-label={t("display.title")}>
        <div className="flex items-center gap-2 border-b px-3 pb-2">
          <DrawerTitle className="sr-only">{t("display.title")}</DrawerTitle>
          <Select value={section} onValueChange={(value) => value && pick(value as Section)}>
            <SelectTrigger className="h-8 w-auto min-w-36 font-medium" aria-label={t("display.section")} data-testid="display-section">
              <SelectValue>
                {(value: Section) => (
                  <SectionLabel section={value} />
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {SECTIONS.map((value) => (
                <SelectItem key={value} value={value} data-testid={`display-section-${value}`}>
                  <SectionLabel section={value} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="truncate rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground" data-testid="display-mode">
            {t("display.forMode", { mode: modeName })}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto size-8"
            onClick={() => change({ textSize: null, font: null, spacing: null, columns: null, chordNotation: null, chordColors: null, capoDisplayMode: null, chordDiagrams: null, hideChords: null })}
            title={t("display.resetHint", { mode: modeName })}
            aria-label={t("display.resetHint", { mode: modeName })}
            data-testid="display-reset"
          >
            <RotateCcw aria-hidden />
          </Button>
          <DrawerClose render={<Button variant="ghost" size="icon" className="size-8" />} aria-label={t("display.close")} data-testid="display-close">
            <X aria-hidden />
          </DrawerClose>
        </div>
        <div className="flex flex-col gap-2 overflow-y-auto px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {section === "text" ? (
            <>
              <Row label={t("display.size")}>
                <ButtonGroup className="w-full">
                  <Choice
                    pressed={false}
                    disabled={settings.textSize <= DISPLAY_TEXT_SIZES[0]!}
                    onClick={() => change({ textSize: stepTextSize(settings.textSize, -1) })}
                    label={t("display.smaller")}
                    testId="display-smaller"
                  >
                    <Minus />
                  </Choice>
                  <span className="flex flex-1 items-center justify-center border-y bg-background text-xs font-medium tabular-nums" data-testid="display-size">
                    {Math.round(settings.textSize * 100)}%
                  </span>
                  <Choice
                    pressed={false}
                    disabled={settings.textSize >= DISPLAY_TEXT_SIZES[DISPLAY_TEXT_SIZES.length - 1]!}
                    onClick={() => change({ textSize: stepTextSize(settings.textSize, 1) })}
                    label={t("display.bigger")}
                    testId="display-bigger"
                  >
                    <Plus />
                  </Choice>
                </ButtonGroup>
              </Row>
              <Row label={t("display.font")}>
                <Choices
                  value={settings.font}
                  onChange={(font) => change({ font })}
                  name="font"
                  options={[
                    { value: "mono", label: t("display.fontMono"), content: <span className="font-mono">Aa</span> },
                    { value: "sans", label: t("display.fontSans"), content: <span className="font-sans">Aa</span> },
                  ]}
                />
              </Row>
              <Row label={t("display.spacing")}>
                <Choices
                  value={settings.spacing}
                  onChange={(spacing) => change({ spacing })}
                  name="spacing"
                  options={[
                    { value: "compact", label: t("display.spacingCompact"), content: <FoldVertical /> },
                    { value: "normal", label: t("display.spacingNormal"), content: <Rows3 /> },
                    { value: "relaxed", label: t("display.spacingRelaxed"), content: <UnfoldVertical /> },
                  ]}
                />
              </Row>
            </>
          ) : null}
          {section === "chords" ? (
            <>
              <Row label={t("display.names")}>
                <Choices
                  value={settings.chordNotation}
                  onChange={(chordNotation) => change({ chordNotation })}
                  name="notation"
                  options={[
                    { value: "LETTERS", label: t("dashboard.notationLetters"), content: "C" },
                    { value: "SOLFEGE", label: t("player.solfege"), content: "Do" },
                    { value: "NASHVILLE", label: t("player.numbers"), content: "1" },
                  ]}
                />
              </Row>
              <Row label={t("display.colors")}>
                <Choices
                  value={settings.chordColors ? "on" : "off"}
                  onChange={(value) => change({ chordColors: value === "on" })}
                  name="colors"
                  options={[
                    { value: "off", label: t("display.colorsOff"), content: <Baseline /> },
                    { value: "on", label: t("display.colorsOn"), content: <Palette /> },
                  ]}
                />
              </Row>
              <Row label={t("display.capo")}>
                <Choices
                  value={settings.capoDisplayMode}
                  onChange={(capoDisplayMode) => change({ capoDisplayMode })}
                  name="capo"
                  options={[
                    { value: "SOUNDING", label: t("display.capoSounding"), content: <Ear /> },
                    { value: "FINGERED", label: t("display.capoShapes"), content: <Hand /> },
                  ]}
                />
              </Row>
              <Row label={t("display.show")}>
                <Choices
                  value={settings.hideChords ? "hidden" : "shown"}
                  onChange={(value) => change({ hideChords: value === "hidden" })}
                  name="chords"
                  options={[
                    { value: "shown", label: t("display.chordsShown"), content: <Eye /> },
                    { value: "hidden", label: t("display.chordsHidden"), content: <EyeOff /> },
                  ]}
                />
              </Row>
            </>
          ) : null}
          {section === "instrument" ? <InstrumentSection settings={settings} player={player} onChange={(chordDiagrams) => change({ chordDiagrams })} /> : null}
          {section === "layout" ? (
            <Row label={t("display.columns")}>
              <Choices
                value={settings.columns}
                onChange={(columns: DisplayColumnsValue) => change({ columns })}
                name="columns"
                options={[
                  { value: "auto", label: t("chart.columnsAuto"), content: <LayoutGrid /> },
                  { value: "1", label: t("chart.columnsCount", { count: 1 }), content: <RectangleVertical /> },
                  { value: "2", label: t("chart.columnsCount", { count: 2 }), content: <Columns2 /> },
                  { value: "3", label: t("chart.columnsCount", { count: 3 }), content: <Columns3 /> },
                ]}
              />
            </Row>
          ) : null}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function SectionLabel({ section }: { section: Section }) {
  const { t } = useTranslation();
  const Icon = SECTION_ICONS[section];
  return (
    <span className="flex items-center gap-2">
      <Icon className="size-4 text-muted-foreground" aria-hidden />
      {t(`display.${section}`)}
    </span>
  );
}

function InstrumentSection({ settings, player, onChange }: { settings: EffectiveDisplaySettings; player?: DiagramPlayer; onChange: (value: ChordDiagramsValue) => void }) {
  const { t } = useTranslation();
  const fretted = settings.chordDiagrams === "GUITAR" || settings.chordDiagrams === "UKULELE";
  const instrument = settings.chordDiagrams === "UKULELE" ? "ukulele" : "guitar";
  const tuning = (instrument === "ukulele" ? player?.ukuleleTuning : player?.guitarTuning) ?? "standard";
  return (
    <>
      <Row label={t("display.diagrams")}>
        <Choices
          value={settings.chordDiagrams}
          onChange={onChange}
          name="diagrams"
          options={[
            { value: "OFF", label: t("dashboard.diagramsOff"), content: t("dashboard.diagramsOff") },
            { value: "GUITAR", label: t("dashboard.diagramsGuitar"), content: t("dashboard.diagramsGuitar") },
            { value: "UKULELE", label: t("dashboard.diagramsUkulele"), content: t("dashboard.diagramsUkulele") },
            { value: "PIANO", label: t("dashboard.diagramsPiano"), content: t("dashboard.diagramsPiano") },
          ]}
        />
      </Row>
      {fretted ? (
        <>
          <Row label={t("display.tuning")}>
            <select
              value={tuning}
              onChange={(e) => changeDiagramPlayer(instrument === "ukulele" ? { ukuleleTuning: e.target.value } : { guitarTuning: e.target.value })}
              className="h-8 w-full rounded-md border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              aria-label={t("display.tuning")}
              data-testid="display-tuning"
            >
              {TUNINGS[instrument].map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </Row>
          <Row label={t("display.leftHanded")}>
            <Choices
              value={player?.leftHanded ? "yes" : "no"}
              onChange={(value) => changeDiagramPlayer({ leftHanded: value === "yes" })}
              name="left-handed"
              options={[
                { value: "no", label: t("dashboard.leftHandedNo"), content: t("dashboard.leftHandedNo") },
                { value: "yes", label: t("dashboard.leftHandedYes"), content: t("dashboard.leftHandedYes") },
              ]}
            />
          </Row>
        </>
      ) : null}
      {settings.chordDiagrams === "PIANO" ? (
        <Row label={t("display.hands")}>
          <Choices
            value={player?.pianoHands === "right" ? "right" : "both"}
            onChange={(pianoHands) => changeDiagramPlayer({ pianoHands })}
            name="hands"
            options={[
              { value: "both", label: t("dashboard.pianoBoth"), content: t("display.handsBoth") },
              { value: "right", label: t("dashboard.pianoRight"), content: t("display.handsRight") },
            ]}
          />
        </Row>
      ) : null}
    </>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-2">
      <span className="truncate text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/** One of a few, side by side; each with its name as a tooltip when it shows an icon. */
function Choices<T extends string>({
  value,
  onChange,
  options,
  name,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; content: ReactNode }[];
  name: string;
}) {
  return (
    <ButtonGroup className="w-full">
      {options.map((option) => (
        <Choice key={option.value} pressed={value === option.value} onClick={() => onChange(option.value)} label={option.label} testId={`display-${name}-${option.value}`}>
          {option.content}
        </Choice>
      ))}
    </ButtonGroup>
  );
}

function Choice({
  pressed,
  onClick,
  label,
  testId,
  disabled,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  label: string;
  testId: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      data-testid={testId}
      className={cn(
        "flex h-8 min-w-0 flex-1 items-center justify-center gap-1 truncate rounded-md border px-2 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0",
        pressed ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
