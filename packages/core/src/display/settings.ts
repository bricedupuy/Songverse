import type {
  AppModeValue,
  CapoDisplayModeValue,
  ChordDiagramsValue,
  ChordNotationValue,
  ControlsLayoutValue,
  ControlsPositionValue,
  LiveControlValue,
  DisplayColumnsValue,
  DisplayFontValue,
  DisplaySpacingValue,
} from "../constants/index.js";
import { APP_MODES } from "../constants/index.js";
import type { DisplaySettings } from "../api-client/index.js";

/**
 * How a player reads charts (issue #209): each mode - Edit, Practice, Live -
 * keeps what the Display panel changed there; anything it didn't comes from
 * the account's settings (the dashboard's Chart display), then a default.
 */
export interface EffectiveDisplaySettings {
  /** The lyrics' size (and the whole chart's, but the chords'). */
  textSize: number;
  /** The chords' size (issue #225): the lyrics' unless set apart. */
  chordSize: number;
  /** Whether the chords' size follows the lyrics'. */
  sizesLinked: boolean;
  font: DisplayFontValue;
  spacing: DisplaySpacingValue;
  columns: DisplayColumnsValue;
  chordNotation: ChordNotationValue;
  chordColors: boolean;
  capoDisplayMode: CapoDisplayModeValue;
  chordDiagrams: ChordDiagramsValue;
  hideChords: boolean;
  /** Live's controls (issue #224): a footer, floating buttons or none; which are hidden; floating ones' opacity. */
  controls: ControlsLayoutValue;
  controlsPosition: ControlsPositionValue;
  hiddenControls: LiveControlValue[];
  controlsOpacity: number;
}

export type SavedDisplaySettings = Partial<Record<AppModeValue, DisplaySettings>>;

/** The account's own settings, the modes' defaults. */
export interface AccountDisplaySettings {
  chordNotation?: ChordNotationValue | null;
  chordColors?: boolean | null;
  capoDisplayMode?: CapoDisplayModeValue | null;
  chordDiagrams?: ChordDiagramsValue | null;
}

/** Live reads from further away: bigger text unless changed there. */
const DEFAULT_TEXT_SIZE: Record<AppModeValue, number> = { EDIT: 1, PRACTICE: 1, LIVE: 1.5 };

/** A mode's settings in full: what it changed, else the account's, else the default. */
export function effectiveDisplaySettings(account: AccountDisplaySettings | null | undefined, saved: SavedDisplaySettings | null | undefined, mode: AppModeValue): EffectiveDisplaySettings {
  const own = saved?.[mode] ?? {};
  return {
    textSize: own.textSize ?? DEFAULT_TEXT_SIZE[mode],
    chordSize: own.chordSize ?? own.textSize ?? DEFAULT_TEXT_SIZE[mode],
    sizesLinked: own.chordSize == null,
    font: own.font ?? "mono",
    spacing: own.spacing ?? "normal",
    columns: own.columns ?? "auto",
    chordNotation: own.chordNotation ?? account?.chordNotation ?? "LETTERS",
    chordColors: own.chordColors ?? account?.chordColors ?? false,
    capoDisplayMode: own.capoDisplayMode ?? account?.capoDisplayMode ?? "SOUNDING",
    chordDiagrams: own.chordDiagrams ?? account?.chordDiagrams ?? "OFF",
    hideChords: own.hideChords ?? false,
    controls: own.controls ?? "footer",
    controlsPosition: own.controlsPosition ?? "bottom-right",
    hiddenControls: own.hiddenControls ?? [],
    controlsOpacity: own.controlsOpacity ?? 0.7,
  };
}

/**
 * Changes merged into what's kept, mode by mode: a field given replaces its
 * value, null removes it (back to the account's), one left out stays.
 */
export function mergeDisplaySettings(
  saved: SavedDisplaySettings | null | undefined,
  changes: Partial<Record<AppModeValue, { [K in keyof DisplaySettings]?: DisplaySettings[K] | null }>>,
): SavedDisplaySettings {
  const next: SavedDisplaySettings = {};
  for (const mode of APP_MODES) {
    const merged: Record<string, unknown> = { ...(saved?.[mode] ?? {}) };
    for (const [field, value] of Object.entries(changes[mode] ?? {})) {
      if (value === null) delete merged[field];
      else if (value !== undefined) merged[field] = value;
    }
    if (Object.keys(merged).length > 0) next[mode] = merged as DisplaySettings;
  }
  return next;
}
