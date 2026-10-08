import "../zod-config.js";
import { z } from "zod";

/**
 * Screen themes (issue #194): how a big screen shows a set - its text,
 * the lines around the current ones, where they sit, the background, the
 * song's title and credits, and how slides come and go. A small JSON
 * document (docs/screen-theme-v1.md), the same for the web screen, the
 * Google TV app (#187) and the native apps (#165): a field a client doesn't
 * know is ignored, a theme it can't read falls back to the default look.
 */

export const SCREEN_THEME_SCHEMA = "screen-theme/v1";

/** Built-in typefaces every client has (the web app serves them itself). */
export const SCREEN_FONTS = ["sans", "rounded", "geometric", "serif", "elegant", "condensed", "display", "mono"] as const;
export type ScreenFont = (typeof SCREEN_FONTS)[number];

/** Each font's family on the web, and what it falls back to. */
export const SCREEN_FONT_FAMILIES: Record<ScreenFont, string> = {
  sans: '"Inter Variable", "Inter", system-ui, sans-serif',
  rounded: '"Nunito Variable", "Nunito", ui-rounded, system-ui, sans-serif',
  geometric: '"Montserrat Variable", "Montserrat", system-ui, sans-serif',
  serif: '"Lora Variable", "Lora", Georgia, serif',
  elegant: '"Playfair Display Variable", "Playfair Display", Georgia, serif',
  condensed: '"Oswald Variable", "Oswald", "Arial Narrow", sans-serif',
  display: '"Bebas Neue", "Oswald Variable", Impact, sans-serif',
  mono: 'ui-monospace, "SF Mono", Menlo, monospace',
};

/** How the lines before and after the current ones look. */
export const SCREEN_CONTEXT_STYLES = ["dim", "small", "blur", "hidden"] as const;
/** Where the lines sit: a lower third leaves the picture above free, for a stream or a video. */
export const SCREEN_POSITIONS = ["top", "center", "bottom", "lower-third"] as const;
/** A still colour, a gradient, or a moving background that answers the words (see `reactive`). */
export const SCREEN_BACKGROUNDS = ["color", "gradient", "aurora", "waves", "particles", "spotlight"] as const;
/** How one slide gives way to the next. */
export const SCREEN_TRANSITIONS = ["cut", "fade", "slide", "rise", "scale", "blur", "zoom"] as const;
/** How a slide's words come in: all at once, line by line, word by word, letter by letter, typed, or glowing in. */
export const SCREEN_REVEALS = ["none", "lines", "words", "letters", "typewriter", "glow"] as const;
export const SCREEN_TEXT_EFFECTS = ["none", "shadow", "outline", "glow"] as const;

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, { message: "a colour is written #rrggbb" });

/** A theme's parts, as an object that ignores fields it doesn't know (reading) or refuses them (a request). */
function screenThemeSchema(strict: boolean) {
  const object = strict ? z.strictObject : z.object;
  return object({
  $schema: z.literal(SCREEN_THEME_SCHEMA).default(SCREEN_THEME_SCHEMA),
  text: object({
      font: z.enum(SCREEN_FONTS).default("sans"),
      /** "auto" fits the longest line; a number is the size in % of the screen's shorter side. */
      size: z.union([z.literal("auto"), z.number().min(2).max(20)]).default("auto"),
      weight: z.number().int().min(100).max(900).multipleOf(100).default(600),
      upperCase: z.boolean().default(false),
      color: color.default("#ffffff"),
      effect: z.enum(SCREEN_TEXT_EFFECTS).default("shadow"),
      lineHeight: z.number().min(0.8).max(2.5).default(1.15),
      align: z.enum(["left", "center", "right"]).default("center"),
      letterSpacing: z.number().min(-0.1).max(0.5).default(0),
    })
    .prefault({}),
  /**
   * The lines being sung and the ones around them. Every screen and Live cut
   * a song into the same slides (lyricSlides), so a theme doesn't change
   * them: it shows the slide, or its whole section with the slide's lines
   * picked out.
   */
  lines: object({
      group: z.enum(["slide", "section"]).default("slide"),
      before: z.number().int().min(0).max(3).default(1),
      after: z.number().int().min(0).max(3).default(1),
      contextStyle: z.enum(SCREEN_CONTEXT_STYLES).default("dim"),
    })
    .prefault({}),
  layout: object({
      position: z.enum(SCREEN_POSITIONS).default("center"),
      /** Kept clear all round, in % of the screen: for TVs that crop their edges. */
      margin: z.number().min(0).max(20).default(5),
    })
    .prefault({}),
  background: object({
      kind: z.enum(SCREEN_BACKGROUNDS).default("color"),
      /** The first is the base; a gradient or a moving background uses the others too. */
      colors: z.array(color).min(1).max(4).default(["#000000"]),
      /** Moves with the song: a pulse as each slide comes, warmer and brighter in a chorus. */
      reactive: z.boolean().default(false),
      /** How much it moves, 0 (still) to 1. */
      motion: z.number().min(0).max(1).default(0.5),
      /** Darkens it under the words, 0 to 0.9: words stay readable over anything. */
      dim: z.number().min(0).max(0.9).default(0),
    })
    .prefault({}),
  title: object({
      show: z.boolean().default(true),
      when: z.enum(["first", "every"]).default("first"),
    })
    .prefault({}),
  credits: object({
      show: z.boolean().default(true),
      where: z.enum(["bottom", "top", "lower-third"]).default("bottom"),
      when: z.enum(["first", "last", "first-and-last", "every"]).default("first-and-last"),
    })
    .prefault({}),
  motion: object({
      transition: z.enum(SCREEN_TRANSITIONS).default("fade"),
      /** A slide's change, in milliseconds; between songs it takes twice as long. */
      duration: z.number().int().min(0).max(3000).default(350),
      reveal: z.enum(SCREEN_REVEALS).default("none"),
      /** Between one line, word or letter coming and the next, in milliseconds. */
      stagger: z.number().int().min(0).max(400).default(60),
    })
    .prefault({}),
  /** The chart, for the band: its chords' colour and size. */
  chords: object({
      color: color.default("#7dd3fc"),
      scale: z.number().min(0.5).max(2).default(1),
    })
    .prefault({}),
  });
}

/** A theme as it's kept and read: every part has its default, so `{}` is the default look; a field it doesn't know is ignored. */
export const ScreenThemeSchema = screenThemeSchema(false);
/** A theme as the API takes it (PUT/POST /screen-themes): an unknown field is refused, by name. */
export const ScreenThemeRequestSchema = screenThemeSchema(true);

export type ScreenTheme = z.output<typeof ScreenThemeSchema>;
export type ScreenThemeInput = z.input<typeof ScreenThemeSchema>;

/** The look a screen has without a theme: white words on black, as before themes. */
export const DEFAULT_SCREEN_THEME: ScreenTheme = ScreenThemeSchema.parse({});

/**
 * A theme as a client reads it: what it says over the defaults; a part it
 * can't read falls back to that part's default, and anything else - not a
 * theme at all - to the default look. Never throws.
 */
export function resolveScreenTheme(input: unknown): ScreenTheme {
  if (!input || typeof input !== "object") return DEFAULT_SCREEN_THEME;
  const whole = ScreenThemeSchema.safeParse(input);
  if (whole.success) return whole.data;
  // Part by part: a bad colour in the background keeps the rest of the theme.
  const parts = input as Record<string, unknown>;
  const theme: Record<string, unknown> = {};
  for (const key of Object.keys(ScreenThemeSchema.shape)) {
    if (key === "$schema" || parts[key] === undefined) continue;
    const one = ScreenThemeSchema.shape[key as keyof typeof ScreenThemeSchema.shape].safeParse(parts[key]);
    if (one.success) theme[key] = one.data;
  }
  return ScreenThemeSchema.parse(theme);
}

/** A built-in look to start from, picked as it is or copied and changed. */
export interface ScreenThemeTemplate {
  id: string;
  /** Its name and what it's for, as the app's locale files word them: `screens.templates.<id>`. */
  theme: ScreenTheme;
}

const template = (id: string, theme: ScreenThemeInput): ScreenThemeTemplate => ({ id, theme: ScreenThemeSchema.parse(theme) });

/**
 * The built-in themes: the default ("classic"), and looks for a room, a
 * concert, a stream, a stage monitor. Their names and descriptions are in
 * the locale files (`screens.templates.<id>`).
 */
export const SCREEN_THEME_TEMPLATES: ScreenThemeTemplate[] = [
  template("classic", {}),
  template("concert", {
    text: { font: "geometric", weight: 800, upperCase: true, effect: "glow", letterSpacing: 0.02 },
    lines: { before: 0, after: 1, contextStyle: "blur" },
    background: { kind: "aurora", colors: ["#05010f", "#6d28d9", "#db2777", "#0ea5e9"], reactive: true, motion: 0.7, dim: 0.15 },
    motion: { transition: "blur", duration: 500, reveal: "words", stagger: 70 },
  }),
  template("chapel", {
    text: { font: "elegant", weight: 500, effect: "shadow", lineHeight: 1.3 },
    lines: { before: 0, after: 0, contextStyle: "hidden" },
    background: { kind: "gradient", colors: ["#1c1206", "#3b2a14", "#0d0905"], motion: 0.2 },
    title: { when: "first" },
    motion: { transition: "fade", duration: 700, reveal: "lines", stagger: 180 },
  }),
  template("sunrise", {
    text: { font: "rounded", weight: 700, effect: "shadow" },
    lines: { before: 1, after: 1, contextStyle: "small" },
    background: { kind: "waves", colors: ["#1e1b4b", "#f97316", "#facc15", "#ec4899"], reactive: true, motion: 0.5, dim: 0.25 },
    motion: { transition: "rise", duration: 450, reveal: "words", stagger: 50 },
  }),
  template("starlight", {
    text: { font: "serif", weight: 600, effect: "glow", lineHeight: 1.25 },
    lines: { before: 1, after: 1, contextStyle: "blur" },
    background: { kind: "particles", colors: ["#020617", "#1e3a8a", "#e0f2fe"], reactive: true, motion: 0.4 },
    motion: { transition: "zoom", duration: 600, reveal: "glow", stagger: 90 },
  }),
  template("spotlight", {
    text: { font: "display", weight: 400, upperCase: true, effect: "none", letterSpacing: 0.04, lineHeight: 1.05 },
    lines: { before: 0, after: 0 },
    background: { kind: "spotlight", colors: ["#000000", "#fef3c7"], reactive: true, motion: 0.6 },
    motion: { transition: "scale", duration: 400, reveal: "letters", stagger: 25 },
  }),
  template("stream", {
    text: { font: "sans", weight: 700, effect: "outline", size: 5.5 },
    lines: { before: 0, after: 0 },
    layout: { position: "lower-third", margin: 4 },
    background: { kind: "color", colors: ["#000000"] },
    title: { show: false },
    credits: { where: "top", when: "first" },
    motion: { transition: "slide", duration: 300, reveal: "none" },
  }),
  template("minimal", {
    text: { font: "sans", weight: 500, align: "left", effect: "none", lineHeight: 1.25 },
    lines: { before: 1, after: 2, contextStyle: "dim" },
    layout: { position: "center", margin: 8 },
    background: { kind: "color", colors: ["#0a0a0a"] },
    motion: { transition: "fade", duration: 250, reveal: "typewriter", stagger: 18 },
  }),
  template("stage-monitor", {
    text: { font: "condensed", weight: 700, upperCase: true, effect: "none", size: 9, lineHeight: 1.05 },
    lines: { group: "section", before: 0, after: 0, contextStyle: "dim" },
    layout: { position: "top", margin: 3 },
    background: { kind: "color", colors: ["#000000"] },
    title: { when: "every" },
    credits: { show: false },
    motion: { transition: "cut", duration: 0, reveal: "none" },
    chords: { color: "#facc15", scale: 1.2 },
  }),
];

export function screenThemeTemplate(id: string | null | undefined): ScreenThemeTemplate | undefined {
  return SCREEN_THEME_TEMPLATES.find((one) => one.id === id);
}

/** A colour's relative luminance (WCAG 2), for contrast. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** The contrast between two colours (WCAG 2): 1 to 21; 4.5 is enough for text, 3 for large text. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return Math.round(((light! + 0.05) / (dark! + 0.05)) * 100) / 100;
}

/**
 * The lowest contrast between a theme's words and what's under them (the
 * background's colours, darkened by `dim`): an editor warns under 4.5. An
 * outline, shadow or glow helps words over a moving background, so they
 * count as half again.
 */
export function screenThemeContrast(theme: ScreenTheme): number {
  const { kind, colors, dim } = theme.background;
  const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const hex = (channels: number[]) => `#${channels.map((one) => Math.round(Math.max(0, Math.min(255, one))).toString(16).padStart(2, "0")).join("")}`;
  const base = rgb(colors[0]!);
  // A gradient's colours are all under the words; a moving background's others are soft lights over its base (at most 45% of them).
  const under =
    kind === "color"
      ? [base]
      : kind === "gradient"
        ? colors.map(rgb)
        : [base, ...colors.slice(1).map((one) => rgb(one).map((channel, i) => base[i]! + (channel - base[i]!) * 0.45))];
  const lowest = Math.min(...under.map((channels) => contrastRatio(theme.text.color, hex(channels.map((channel) => channel * (1 - dim))))));
  return theme.text.effect === "none" ? lowest : Math.round(Math.min(21, lowest * 1.5) * 100) / 100;
}

/** What kind of part a pass is, for a background that warms up in a chorus: from its label. */
export function sectionEnergy(label: string | null | undefined): "low" | "mid" | "high" {
  const text = (label ?? "").toLowerCase();
  // A build-up first: a pre-chorus isn't the chorus yet.
  if (/bridge|pont|pre-?chorus|pré-?refrain|build|montée/.test(text)) return "mid";
  if (/chorus|refrain|refrão|estribillo|coro|tag|climax/.test(text)) return "high";
  return "low";
}
