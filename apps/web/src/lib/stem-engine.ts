import { multitracksOf, STEM_PARTS, TIME_SIGNATURE_PATTERN, transposesPart, type Attachment, type StemPart } from "@songverse/core";
import { useSyncExternalStore } from "react";
import { deviceNow, OutputClock } from "#/lib/output-clock";

/**
 * The stem player's audio (issue #64), kept outside any page so a song
 * keeps playing while the user moves around the app or leaves Practice:
 * one per tab, with the song it has loaded, what's muted and where it is.
 * The dock on a song's page drives it; elsewhere a floating button leads
 * back there.
 *
 * Web Audio keeps the parts on one clock: every part starts at the same
 * instant of the same AudioContext, so they stay sample-locked, where
 * separate <audio> elements drift apart.
 */

/** A file the player plays: a stem (with its part), or a whole recording (null) when a song has no stems. */
export type StemFile = Attachment & { stemPart: StemPart | null };

/** A song's stems as a page offers them to the player. */
export interface StemSong {
  songVersionId: string;
  title: string;
  /** The page to come back to: the song's, or its page in a set. */
  returnTo: string;
  stems: StemFile[];
  /** The file's bytes; `onProgress` hears them arrive, when the source can tell. */
  load: (file: Attachment, onProgress?: (received: number, total: number | null) => void) => Promise<Blob>;
  /** The song's tempo and time signature, for the metronome with the recording (issue #100); its recording's own tempo comes first. */
  tempo?: number | null;
  timeSignature?: { numerator: number; denominator: number } | null;
  /** Which of the song's multitracks `stems` are (issue #123): null its original stems. */
  multitrackId?: string | null;
  /** The song's multitracks, for the player to offer the others. */
  multitracks?: MultitrackChoice[];
  /** Where the choice of multitrack is remembered: the song, or the song in a set (issue #127). */
  choiceKey?: string;
  /** Transposed by this many semitones as it plays (issue #129); `transposeParts` says, by file, which parts are (#135) - else all but the drums and cues. */
  transpose?: number;
  transposeParts?: Record<string, boolean>;
  /** The song's own key: what the stems are in when they don't say (for the key they're transposed to). */
  songKey?: string | null;
  /** The key the page plays the song in (a set's): with nothing chosen, the stems are transposed to it. */
  targetKey?: string | null;
  /** Recording a part from the player (issue #127): what the recorder needs; left out where it can't (offline). */
  record?: {
    attachments: Attachment[];
    songKey?: string;
    setlist?: { id: string; name: string } | null;
    onSaved: () => void;
  };
}

/** A multitrack as the player lists it. */
export interface MultitrackChoice {
  id: string | null;
  name: string | null;
  parts: number;
  /** The set it was recorded for (issue #127). */
  setlistId: string | null;
}

export interface StemTrack {
  id: string;
  /** Null: a whole recording, played when the song has no stems. */
  part: StemPart | null;
  /** Its own name for the part (issue #131), shown instead of the part's. */
  partName: string | null;
  /** Who recorded it, when it isn't the viewer (issue #131). */
  by: string | null;
  filename: string;
  /** 1, 2… when two files are the same part ("Guitar 1"), else 0. */
  number: number;
  /** The waveform, 0-1 per slice; null until decoded. */
  peaks: number[] | null;
  /** Its length (s), once decoded: a take shorter than the rest draws as long as it is. */
  length: number;
  /** Recorded this many semitones above the multitrack (issue #135). */
  offset: number;
  /** The take just recorded in the player (issue #134), not kept yet. */
  take?: boolean;
  failed: boolean;
  /** Failed because the file has nothing in it (a take where the microphone gave nothing). */
  empty?: boolean;
}

export interface StemState {
  /** What's loaded: which song, and which files (a part reassigned is another set of stems). */
  key: string | null;
  songVersionId: string | null;
  /** Which of its multitracks is loaded (issue #123); null its original stems. */
  multitrackId: string | null;
  title: string;
  returnTo: string;
  status: "idle" | "loading" | "ready" | "error";
  /** How much of the stems has downloaded, 0-1, while loading. */
  downloaded: number;
  tracks: StemTrack[];
  playing: boolean;
  position: number;
  duration: number;
  muted: ReadonlySet<string>;
  soloed: ReadonlySet<string>;
  /** The song whose dock is on screen, if any: elsewhere a playing song gets the floating button. */
  docked: string | null;
  /** Playing: recording position `position` (s) heard at `epoch` on the device's clock (ms) - what Sync play shares (issue #100). */
  anchor: { epoch: number; position: number } | null;
  /** Following Sync play's leader: their name; play, pause and seek are theirs. */
  following: string | null;
  /** Following, but the browser hasn't let it make a sound yet: a press will (unlockStemsAudio). */
  audioBlocked: boolean;
  /** Transposed by this many semitones (issue #129); by file, which parts are, when not as their part says (#135). */
  transpose: number;
  transposeParts: Record<string, boolean>;
  /** Transposing couldn't start here (no AudioWorklet, say): it plays as recorded. */
  transposeFailed: boolean;
  /** The recording's beat: its tempo, time signature and where its first beat falls (s), for the metronome with it; null without a tempo. */
  beat: { tempo: number; timeSignature: { numerator: number; denominator: number } | null; firstBeat: number } | null;
}

const PEAK_SLICES = 400;

const EMPTY: StemState = {
  key: null,
  songVersionId: null,
  multitrackId: null,
  title: "",
  returnTo: "",
  status: "idle",
  downloaded: 0,
  tracks: [],
  playing: false,
  position: 0,
  duration: 0,
  muted: new Set(),
  soloed: new Set(),
  docked: null,
  anchor: null,
  following: null,
  audioBlocked: false,
  transpose: 0,
  transposeParts: {},
  transposeFailed: false,
  beat: null,
};

/** The stretch node's own methods (signalsmith-stretch). */
type StretchNode = AudioWorkletNode & {
  schedule: (change: Record<string, number | boolean>) => Promise<unknown>;
  start: (when?: number) => Promise<unknown>;
  latency: () => Promise<number>;
};

let state: StemState = EMPTY;
const listeners = new Set<() => void>();
let context: AudioContext | null = null;
let clock: OutputClock | null = null;
/** While Sync play is on: straight to the speakers, whose delay the output clock knows (not iOS's audio element, whose it can't). */
let directOutput = false;
// Where every part goes: the speakers, or on iPhone and iPad an <audio> element (see outputFor).
let bus: GainNode | null = null;
let element: HTMLAudioElement | null = null;
let streamOut: MediaStreamAudioDestinationNode | null = null;
// The song last played, for the lock screen's Play button.
let lastSong: StemSong | null = null;
let buffers = new Map<string, AudioBuffer>();
let gains = new Map<string, GainNode>();
// Transposing (issues #129, #135): each part is moved by the transposition,
// less the semitones it was recorded above its multitrack - or not at all
// (the drums and cues, unless asked). The parts moved by the same amount
// share a bus into a stretch node set to it; the rest go through `plain`,
// delayed by as much as the stretch nodes delay theirs. Sources start that
// much earlier (`latency`), so what's heard stays in place.
let tracksInfo = new Map<string, { part: StemPart | null; offset: number }>();
let plain: GainNode | null = null;
let shiftBuses = new Map<number, GainNode>();
let pool: { node: StretchNode; shift: number | null }[] = [];
let making: Promise<StretchNode | null> | null = null;
let stretchLatency = 0;
let delay: DelayNode | null = null;
let latency = 0;
let sources: AudioBufferSourceNode[] = [];
// The context's time at which the song's 0:00 is (or would be) playing.
let startedAt = 0;
let offset = 0;
let timer: ReturnType<typeof setInterval> | null = null;
// Bumped by each load, so a load that's been replaced drops its results.
let generation = 0;
// The load under way, so Play during a prefetch waits for it rather than starting over.
let loading: { key: string; done: Promise<boolean> } | null = null;

function set(change: Partial<StemState>) {
  state = { ...state, ...change };
  for (const listener of listeners) listener();
}

/** A song's stems in the player's order: by part, then by name - all of them, whatever multitrack. */
export function stemsOf(attachments: Attachment[]): (Attachment & { stemPart: StemPart })[] {
  return attachments
    .filter((file): file is Attachment & { stemPart: StemPart } => file.type === "AUDIO" && file.stemPart !== null)
    .sort((a, b) => STEM_PARTS.indexOf(a.stemPart) - STEM_PARTS.indexOf(b.stemPart) || a.filename.localeCompare(b.filename));
}

/**
 * What the player plays for a song (issues #66, #123): the multitrack
 * asked for, or its first (its original stems when it has them), or when
 * it has none its latest whole recording, or nothing. `strict`: only the
 * multitrack asked for (Sync play follows the leader's, not another).
 */
export function playableOf(attachments: Attachment[], multitrackId?: string | null, strict = false): StemFile[] {
  // One with only other takes has nothing to play.
  const multitracks = multitracksOf(attachments).filter((multitrack) => multitrack.files.length > 0);
  const chosen = multitrackId === undefined ? undefined : multitracks.find((multitrack) => multitrack.id === multitrackId);
  if (chosen) return chosen.files;
  if (strict && multitrackId) return [];
  if (multitracks[0]) return multitracks[0].files;
  const [latest] = attachments.filter((file) => file.type === "AUDIO").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return latest ? [latest] : [];
}

/** A song's files for the player: the chosen multitrack's (see chooseMultitrack), and the others to offer. */
export function stemFilesOf(
  attachments: Attachment[],
  multitrackId: string | null | undefined,
  /** On a set's song page (issue #127): with nothing chosen, the multitrack recorded for that set. */
  setlistId?: string,
): Pick<StemSong, "stems" | "multitrackId" | "multitracks"> {
  const forSet = multitrackId === undefined && setlistId ? multitracksOf(attachments).find((multitrack) => multitrack.setlistId === setlistId && multitrack.files.length > 0) : undefined;
  const stems = playableOf(attachments, forSet ? forSet.id : multitrackId);
  const multitracks = multitracksOf(attachments)
    .filter((multitrack) => multitrack.files.length > 0)
    .map((multitrack) => ({ id: multitrack.id, name: multitrack.name, parts: multitrack.files.length, setlistId: multitrack.setlistId }));
  return { stems, multitrackId: stems[0]?.multitrackId ?? null, multitracks };
}

// --- how far each song's stems are transposed (issue #129), remembered on the device

const TRANSPOSE_KEY = "songverse.stems.transpose.";

/** A song's transposition (issues #129, #135): how far, and by file which parts, when not as their part says. */
export interface StemTranspose {
  steps: number;
  parts: Record<string, boolean>;
}
const transposes = new Map<string, StemTranspose | undefined>();
const transposeListeners = new Set<() => void>();

function transposeOf(key: string): StemTranspose | undefined {
  if (transposes.has(key)) return transposes.get(key);
  let saved: StemTranspose | undefined;
  try {
    const raw = localStorage.getItem(TRANSPOSE_KEY + key);
    const parsed = raw ? (JSON.parse(raw) as { steps?: unknown; parts?: unknown }) : null;
    if (parsed && typeof parsed.steps === "number") {
      const parts = parsed.parts && typeof parsed.parts === "object" ? Object.entries(parsed.parts).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean") : [];
      saved = { steps: parsed.steps, parts: Object.fromEntries(parts) };
    }
  } catch {
    // Storage blocked, or not ours.
  }
  transposes.set(key, saved);
  return saved;
}

/** Transposes the song's stems (`key`: the song, or the song in a set) from now on; undefined goes back to the default. */
export function chooseStemTranspose(key: string, value: StemTranspose | undefined) {
  transposes.set(key, value);
  try {
    if (value) localStorage.setItem(TRANSPOSE_KEY + key, JSON.stringify(value));
    else localStorage.removeItem(TRANSPOSE_KEY + key);
  } catch {
    // Remembered until the page reloads.
  }
  for (const listener of transposeListeners) listener();
}

/** The transposition chosen for the song; undefined when none was (the default then). */
export function useChosenTranspose(key: string): StemTranspose | undefined {
  return useSyncExternalStore(
    (listener) => {
      transposeListeners.add(listener);
      return () => transposeListeners.delete(listener);
    },
    () => transposeOf(key),
    () => undefined,
  );
}

// --- which multitrack each song plays (issue #123), remembered on the device

const CHOICE_KEY = "songverse.stems.multitrack.";
const choices = new Map<string, string | null>();
const choiceListeners = new Set<() => void>();

function choiceOf(songVersionId: string): string | null | undefined {
  if (choices.has(songVersionId)) return choices.get(songVersionId);
  try {
    const saved = localStorage.getItem(CHOICE_KEY + songVersionId);
    if (saved !== null) return saved === "" ? null : saved;
  } catch {
    // Storage blocked.
  }
  return undefined;
}

/** Plays that multitrack of the song from now on (null: its original stems). */
export function chooseMultitrack(songVersionId: string, multitrackId: string | null) {
  choices.set(songVersionId, multitrackId);
  try {
    localStorage.setItem(CHOICE_KEY + songVersionId, multitrackId ?? "");
  } catch {
    // Remembered until the page reloads.
  }
  for (const listener of choiceListeners) listener();
}

/** The multitrack chosen for the song; undefined when none was (its first then). */
export function useChosenMultitrack(songVersionId: string): string | null | undefined {
  return useSyncExternalStore(
    (listener) => {
      choiceListeners.add(listener);
      return () => choiceListeners.delete(listener);
    },
    () => choiceOf(songVersionId),
    () => undefined,
  );
}

export function stemKey(song: Pick<StemSong, "songVersionId" | "stems">): string {
  return `${song.songVersionId}|${song.stems.map((stem) => `${stem.id}:${stem.stemPart}`).join()}`;
}

/** Tracks as listed before anything is decoded. */
export function tracksOf(stems: StemFile[]): StemTrack[] {
  return stems.map((stem) => {
    // Two of a part are numbered ("Guitar 1"), unless they're named.
    const same = stems.filter((other) => other.stemPart === stem.stemPart && !other.partName);
    return {
      id: stem.id,
      part: stem.stemPart,
      partName: stem.partName || null,
      by: stem.mine === false ? (stem.uploadedBy?.displayName ?? null) : null,
      filename: stem.filename,
      number: !stem.partName && same.length > 1 ? same.indexOf(stem) + 1 : 0,
      peaks: null,
      length: 0,
      offset: stem.pitchOffset ?? 0,
      failed: false,
    };
  });
}

export function isAudible(current: Pick<StemState, "muted" | "soloed">, id: string): boolean {
  return current.soloed.size > 0 ? current.soloed.has(id) : !current.muted.has(id);
}

function applyGains(immediately = false) {
  if (!context) return;
  for (const [id, gain] of gains) {
    const value = isAudible(state, id) ? 1 : 0;
    if (immediately) gain.gain.setValueAtTime(value, context.currentTime);
    else gain.gain.setTargetAtTime(value, context.currentTime, 0.01);
  }
}

function peaksOf(buffer: AudioBuffer): number[] {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  const size = Math.max(1, Math.floor(buffer.length / PEAK_SLICES));
  // Enough samples per slice to see its loudest moments, without reading them all.
  const step = Math.max(1, Math.floor(size / 256));
  const peaks: number[] = [];
  for (let slice = 0; slice < PEAK_SLICES; slice++) {
    let peak = 0;
    const end = Math.min(buffer.length, (slice + 1) * size);
    for (let i = slice * size; i < end; i += step) {
      for (const data of channels) peak = Math.max(peak, Math.abs(data[i] ?? 0));
    }
    peaks.push(peak);
  }
  // Each part at its own scale, so a quiet one still shows its shape.
  const loudest = Math.max(...peaks, 0.0001);
  return peaks.map((peak) => peak / loudest);
}

function stopSources() {
  for (const source of sources) {
    source.onended = null;
    try {
      source.stop();
    } catch {
      // Never started.
    }
  }
  sources = [];
}

function stopTimer() {
  if (timer) clearInterval(timer);
  timer = null;
}

function now(): number {
  return context ? Math.min(state.duration, Math.max(0, context.currentTime - startedAt)) : offset;
}

function startAt(from: number, at?: number, anchor?: { epoch: number; position: number }) {
  if (!context) return;
  stopSources();
  stopTimer();
  // A moment ahead, so every part is scheduled before the first one starts.
  const when = Math.max(at ?? 0, context.currentTime + 0.05 + latency);
  for (const [id, buffer] of buffers) {
    const gain = gains.get(id);
    if (!gain || from >= buffer.duration) continue;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    // Early by the transposing's latency: heard at `when`.
    source.start(when - latency, from);
    sources.push(source);
  }
  startedAt = when - from;
  const heard = { epoch: clock ? clock.epochOf(when) : Number.NaN, position: from };
  probe()?.push({ zeroAt: heard.epoch - from * 1000, at: deviceNow() });
  set({ anchor: anchor ?? heard });
  // A timer rather than animation frames, which stop in a background tab.
  timer = setInterval(() => {
    const at = now();
    if (at >= state.duration) {
      stopSources();
      stopTimer();
      offset = 0;
      element?.pause();
      set({ playing: false, position: 0, anchor: null });
      updateMediaSession();
    } else {
      set({ position: at });
    }
  }, 100);
}

/**
 * iOS suspends Web Audio when the screen locks, but lets a media element
 * play on: there the parts are also mixed into a stream an <audio> element
 * plays, in the "playback" audio session (which the ring/silent switch
 * doesn't mute either). That way crackles, though, so it's only heard while
 * the page is hidden - the screen locked, another app on top - and on
 * screen they go straight to the speakers, the element playing muted (see
 * routeForScreen). Elsewhere they only go straight to the speakers.
 * `songverse.stems.output` = "element" forces the element (for tests).
 */
function viaElement(): boolean {
  try {
    if (localStorage.getItem("songverse.stems.output") === "element") return true;
  } catch {
    // Storage blocked.
  }
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function outputFor(ctx: AudioContext): GainNode {
  const mix = ctx.createGain();
  mix.connect(ctx.destination);
  if (!directOutput && viaElement() && typeof ctx.createMediaStreamDestination === "function") {
    streamOut = ctx.createMediaStreamDestination();
    mix.connect(streamOut);
    element = new Audio();
    element.setAttribute("playsinline", "");
    element.srcObject = streamOut.stream;
    element.muted = true;
  }
  return mix;
}

/**
 * Where the stems are heard on an iPhone or iPad: on screen, straight from
 * the speakers (clean); hidden, through the element (which plays on with
 * the screen locked, but crackles). Each time the page is shown or hidden.
 */
function routeForScreen() {
  if (!context || !bus || !element) return;
  const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
  try {
    bus.disconnect(context.destination);
  } catch {
    // Wasn't connected.
  }
  if (!hidden) bus.connect(context.destination);
  element.muted = !hidden;
  // For the end-to-end suites: which way it's heard.
  if (typeof window !== "undefined") {
    const w = window as unknown as { songverseStems?: { starts: unknown[]; heardVia?: string } };
    w.songverseStems ??= { starts: [] };
    w.songverseStems.heardVia = hidden ? "element" : "speakers";
  }
}

/** The element refused to play (no gesture, say): straight to the speakers instead. */
async function startElement() {
  if (!element || !bus || !context) return;
  try {
    await element.play();
    routeForScreen();
  } catch {
    if (streamOut) bus.disconnect(streamOut);
    element = null;
    try {
      bus.connect(context.destination);
    } catch {
      // Closed meanwhile.
    }
  }
}

function setAudioSession() {
  // Safari 16.4+: play like a music app, on with the screen locked and the silent switch on.
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  if (session) session.type = "playback";
}

/** The lock screen and headphones' controls, and what they show. */
function updateMediaSession() {
  if (!("mediaSession" in navigator)) return;
  const media = navigator.mediaSession;
  media.playbackState = state.playing ? "playing" : state.key ? "paused" : "none";
  if (!state.key) {
    media.metadata = null;
    return;
  }
  if (media.metadata?.title !== state.title) media.metadata = new MediaMetadata({ title: state.title, artist: "Songverse" });
  try {
    if (state.duration) media.setPositionState({ duration: state.duration, position: Math.min(state.position, state.duration), playbackRate: 1 });
  } catch {
    // Not supported here.
  }
}

function setMediaActions() {
  if (!("mediaSession" in navigator)) return;
  const actions: [MediaSessionAction, MediaSessionActionHandler][] = [
    ["play", () => void (lastSong && playStems(lastSong))],
    ["pause", () => pauseStems()],
    ["seekto", (details) => seekStems(details.seekTime ?? 0)],
    ["seekbackward", (details) => seekStems(now() - (details.seekOffset ?? 10))],
    ["seekforward", (details) => seekStems(now() + (details.seekOffset ?? 10))],
  ];
  for (const [action, handler] of actions) {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch {
      // Not supported here.
    }
  }
}

// Back from the lock screen or another app with the context interrupted: carry on.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    routeForScreen();
    if (document.visibilityState === "visible" && state.playing && context && context.state !== "running") void context.resume();
  });
}

/** Forgets the loaded song and frees its audio. */
export function unloadStems() {
  generation++;
  stopSources();
  stopTimer();
  clock?.dispose();
  clock = null;
  void context?.close().catch(() => {});
  context = null;
  bus = null;
  element?.pause();
  if (element) element.srcObject = null;
  element = null;
  streamOut = null;
  buffers = new Map();
  gains = new Map();
  tracksInfo = new Map();
  plain = null;
  shiftBuses = new Map();
  pool = [];
  making = null;
  delay = null;
  latency = 0;
  offset = 0;
  // Following Sync play's leader carries on through the next song's load.
  set({ ...EMPTY, docked: state.docked, following: state.following });
  updateMediaSession();
}

function load(song: StemSong): Promise<boolean> {
  const key = stemKey(song);
  if (state.key === key && state.status === "ready") return Promise.resolve(true);
  if (loading?.key === key) return loading.done;
  const done = loadNow(song, key);
  loading = { key, done };
  void done.finally(() => {
    if (loading?.done === done) loading = null;
  });
  return done;
}

async function loadNow(song: StemSong, key: string): Promise<boolean> {
  // Parts muted or soloed before the first Play stay so.
  const ids = new Set(song.stems.map((stem) => stem.id));
  const muted = new Set([...state.muted].filter((id) => ids.has(id)));
  const soloed = new Set([...state.soloed].filter((id) => ids.has(id)));
  unloadStems();
  const mine = generation;
  setAudioSession();
  const ctx = new AudioContext();
  context = ctx;
  clock = new OutputClock(ctx);
  const mix = outputFor(ctx);
  bus = mix;
  plain = ctx.createGain();
  plain.connect(mix);
  tapFor(ctx, mix);
  latency = 0;
  set({
    transpose: song.transpose ?? 0,
    transposeParts: song.transposeParts ?? {},
    transposeFailed: false,
    key,
    songVersionId: song.songVersionId,
    multitrackId: song.multitrackId ?? song.stems[0]?.multitrackId ?? null,
    title: song.title,
    returnTo: song.returnTo,
    status: "loading",
    downloaded: 0,
    tracks: tracksOf(song.stems),
    muted,
    soloed,
    beat: beatOf(song),
  });
  // Bytes so far per file, against the sizes the song lists (or the server says).
  const received = new Map<string, number>();
  const sizes = new Map(song.stems.map((stem) => [stem.id, stem.sizeBytes ?? 0]));
  let reported = 0;
  const progress = (id: string, bytes: number, total: number | null, last = false) => {
    received.set(id, bytes);
    if (total && !sizes.get(id)) sizes.set(id, total);
    const now = Date.now();
    // A tenth of a second between updates is plenty for a progress bar.
    if (mine !== generation || (!last && now - reported < 100)) return;
    reported = now;
    const all = [...sizes.values()].reduce((sum, size) => sum + size, 0);
    if (all) set({ downloaded: Math.min(1, [...received.values()].reduce((sum, size) => sum + size, 0) / all) });
  };
  const decoded = await Promise.all(
    song.stems.map(async (stem) => {
      let buffer: AudioBuffer | null = null;
      let empty = false;
      try {
        const blob = await song.load(stem, (bytes, total) => progress(stem.id, bytes, total));
        progress(stem.id, blob.size, blob.size, true);
        // A few hundred bytes: headers, no sound.
        empty = blob.size < 1024;
        buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
      } catch {
        // Shown on its row; the other parts still play.
      }
      return { stem, buffer, empty };
    }),
  );
  if (mine !== generation) return false;
  for (const { stem, buffer } of decoded) {
    if (!buffer) continue;
    const gain = ctx.createGain();
    tracksInfo.set(stem.id, { part: stem.stemPart, offset: stem.pitchOffset ?? 0 });
    gain.connect(plain);
    buffers.set(stem.id, buffer);
    gains.set(stem.id, gain);
  }
  const peaks = new Map(decoded.map(({ stem, buffer }) => [stem.id, buffer ? peaksOf(buffer) : null]));
  const lengths = new Map(decoded.map(({ stem, buffer }) => [stem.id, buffer?.duration ?? 0]));
  const empties = new Set(decoded.filter((item) => item.empty && !item.buffer).map((item) => item.stem.id));
  const tracks = state.tracks.map((track) => ({ ...track, peaks: peaks.get(track.id) ?? null, length: lengths.get(track.id) ?? 0, failed: !peaks.get(track.id), empty: empties.has(track.id) }));
  if (buffers.size === 0) {
    set({ status: "error", tracks });
    return false;
  }
  await route();
  if (mine !== generation) return false;
  set({ status: "ready", tracks, duration: Math.max(...[...buffers.values()].map((buffer) => buffer.duration)) });
  return true;
}

// --- transposing (issue #129)

/** How far a part is moved: the transposition less what it was recorded above its multitrack, if it's transposed at all. */
function shiftOf(id: string): number {
  const info = tracksInfo.get(id);
  if (!info) return 0;
  const moved = state.transposeParts[id] ?? transposesPart(info.part);
  return moved ? state.transpose - info.offset : 0;
}

/**
 * Wires the parts for the transposition: straight to the output when
 * nothing's moved; else each amount through a stretch node set to it (made
 * as needed, loaded only then), the rest through a delay as long as their
 * latency.
 */
async function route() {
  const ctx = context;
  if (!ctx || !bus || !plain) return;
  const mine = generation;
  const wanted = () => new Set([...gains.keys()].map(shiftOf).filter((shift) => shift !== 0));
  // Enough stretch nodes, made one at a time (two changes in a row share one).
  while (!state.transposeFailed && pool.length < wanted().size) {
    making ??= makeStretch(ctx, bus);
    const node = await making;
    making = null;
    if (mine !== generation) return;
    if (!node) {
      set({ transposeFailed: true });
      break;
    }
    if (!pool.some((entry) => entry.node === node)) pool.push({ node, shift: null });
  }
  if (mine !== generation) return;
  const shifts = state.transposeFailed ? new Set<number>() : wanted();
  // Each amount a node: the one it had, else one that's free.
  for (const entry of pool) if (entry.shift !== null && !shifts.has(entry.shift)) entry.shift = null;
  for (const shift of shifts) {
    if (pool.some((entry) => entry.shift === shift)) continue;
    const free = pool.find((entry) => entry.shift === null);
    if (!free) continue;
    free.shift = shift;
    void free.node.schedule({ semitones: shift, output: ctx.currentTime });
  }
  for (const shiftBus of shiftBuses.values()) shiftBus.disconnect();
  plain.disconnect();
  for (const entry of pool) {
    if (entry.shift === null) continue;
    let shiftBus = shiftBuses.get(entry.shift);
    if (!shiftBus) {
      shiftBus = ctx.createGain();
      shiftBuses.set(entry.shift, shiftBus);
    }
    shiftBus.connect(entry.node);
  }
  const moving = pool.some((entry) => entry.shift !== null);
  plain.connect(moving && delay ? delay : bus);
  latency = moving ? stretchLatency : 0;
  rewire();
}

/** A stretch node on the output (and, with the first, a delay as long as its latency for the parts it doesn't move); null when it can't be made here. */
async function makeStretch(ctx: AudioContext, output: AudioNode): Promise<StretchNode | null> {
  try {
    const { default: SignalsmithStretch } = await import("signalsmith-stretch");
    const node = (await SignalsmithStretch(ctx, { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] })) as StretchNode;
    // Its defaults: formant compensation is for one voice alone - on a mix of
    // parts it made the sound wobble, and quieter (measured: twice the
    // wobble of a held chord, a third of its level).
    await node.start();
    const nodeLatency = await node.latency();
    if (context !== ctx) return null;
    node.connect(output);
    if (!delay) {
      stretchLatency = nodeLatency;
      delay = ctx.createDelay(2);
      delay.delayTime.value = stretchLatency;
      delay.connect(output);
    }
    return node;
  } catch {
    return null;
  }
}

/** Each part to the bus of the amount it's moved by, or `plain`. */
function rewire() {
  for (const [id, gain] of gains) {
    gain.disconnect();
    const shift = shiftOf(id);
    const target = (shift !== 0 && shiftBuses.get(shift) && pool.some((entry) => entry.shift === shift) ? shiftBuses.get(shift) : plain) ?? null;
    if (target) gain.connect(target);
  }
}

/** Starts again where it's heard, after the transposing's latency changed. */
function replay() {
  if (!context || !state.playing) return;
  const ahead = 0.05 + latency;
  if (state.following && clock && state.anchor) {
    const zero = clock.timeOf(state.anchor.epoch) - state.anchor.position;
    const when = context.currentTime + ahead;
    return startAt(when - zero, when, state.anchor);
  }
  startAt(now() + ahead, context.currentTime + ahead);
}

/**
 * Transposes the stems as they play (issues #129, #135): by `steps`
 * semitones; `parts` says, by file, which parts are moved when it's not as
 * their part says. Taken up at the next load when nothing's loaded.
 */
export async function setStemsTranspose(steps: number, parts: Record<string, boolean> = {}) {
  if (state.transpose === steps && sameParts(state.transposeParts, parts)) return;
  const before = latency;
  set({ transpose: steps, transposeParts: parts, transposeFailed: false });
  if (!context || state.status !== "ready") return;
  await route();
  if (latency !== before) replay();
}

function sameParts(a: Record<string, boolean>, b: Record<string, boolean>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((key) => a[key] === b[key]);
}

/** Whether a part is moved when transposing (issue #135): as chosen for it, else as its part says. */
export function isTransposed(current: Pick<StemState, "transposeParts">, track: Pick<StemTrack, "id" | "part">): boolean {
  return current.transposeParts[track.id] ?? transposesPart(track.part);
}

/**
 * Starts loading a song's stems before Play (issue #64), when its page
 * opens in Practice, so Play is usually instant. Never while another song
 * plays; a paused one makes way.
 */
export function prefetchStems(song: StemSong) {
  if (state.playing) return;
  void load(song);
}

/** Other players (YouTube, #66) paused when the stems start: one thing plays at a time. */
export const otherPlayers = new Set<() => void>();

/** Plays `song`, loading it first (and stopping another one) if it isn't what's loaded. */
export async function playStems(song: StemSong) {
  // Following Sync play's leader: theirs to start; a press only lets the browser make sound.
  if (state.following) return unlockStemsAudio();
  lastSong = song;
  for (const pause of otherPlayers) pause();
  // load() sets up the audio before its first wait: start it here, still inside the tap,
  // which is the only time iOS lets sound start.
  const loaded = load(song);
  void context?.resume();
  const starting = startElement();
  if (!(await loaded) || !context) return;
  await context.resume();
  await starting;
  // Gains before the first sound, so a part muted while loading stays silent.
  applyGains(true);
  startAt(offset);
  set({ playing: true, returnTo: song.returnTo, title: song.title });
  setMediaActions();
  updateMediaSession();
}

export function pauseStems() {
  if (state.following) return;
  pause();
}

function pause() {
  if (!state.playing) return;
  offset = now();
  stopSources();
  stopTimer();
  element?.pause();
  set({ playing: false, position: offset, anchor: null });
  updateMediaSession();
}

export function seekStems(to: number) {
  if (state.following) return;
  offset = Math.min(Math.max(0, to), state.duration);
  set({ position: offset });
  if (state.playing) startAt(offset);
  updateMediaSession();
}

export function toggleStemMute(id: string) {
  const muted = new Set(state.muted);
  if (!muted.delete(id)) muted.add(id);
  set({ muted });
  applyGains();
}

export function toggleStemSolo(id: string) {
  const soloed = new Set(state.soloed);
  if (!soloed.delete(id)) soloed.add(id);
  set({ soloed });
  applyGains();
}

/** A song's dock is on screen. */
export function dockStems(songVersionId: string) {
  if (state.docked !== songVersionId) set({ docked: songVersionId });
}

/** …and gone (unless another song's dock took its place meanwhile). */
export function undockStems(songVersionId: string) {
  if (state.docked === songVersionId) set({ docked: null });
}

/** The recording's beat, from its first file (the stems share it) and the song. */
export function beatOf(song: Pick<StemSong, "stems" | "tempo" | "timeSignature">): StemState["beat"] {
  const first = song.stems[0];
  const tempo = first?.recordingTempo ?? song.tempo ?? null;
  if (!tempo) return null;
  return { tempo, timeSignature: timeSignatureOf(first?.recordingTimeSignature) ?? song.timeSignature ?? null, firstBeat: first?.recordingFirstBeat ?? 0 };
}

/** "6/8" as numbers; null when there's none or it doesn't read. */
export function timeSignatureOf(text: string | null | undefined): { numerator: number; denominator: number } | null {
  const match = text ? TIME_SIGNATURE_PATTERN.exec(text) : null;
  return match ? { numerator: Number(match[1]), denominator: Number(match[2]) } : null;
}

// --- Sync play (issue #100)

/** For the end-to-end suites: when each start places the recording's 0:00, on the device's clock. */
function probe(): { zeroAt: number; at: number }[] | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { songverseStems?: { starts: { zeroAt: number; at: number }[] } };
  w.songverseStems ??= { starts: [] };
  if (w.songverseStems.starts.length > 50) w.songverseStems.starts.splice(0, 25);
  return w.songverseStems.starts;
}

/** For the end-to-end suites (issue #129): what the stems play, as a stream they can record, when `songverseStems.tap` is set. */
function tapFor(ctx: AudioContext, mix: GainNode) {
  if (typeof window === "undefined") return;
  const w = window as unknown as { songverseStems?: { tap?: boolean; stream?: MediaStream } };
  if (!w.songverseStems?.tap) return;
  const tap = ctx.createMediaStreamDestination();
  mix.connect(tap);
  w.songverseStems.stream = tap.stream;
}

/** While Sync play is on, stems loaded from now on play straight to the speakers. */
export function setStemsDirectOutput(direct: boolean) {
  directOutput = direct;
}

/** The leader's playback: recording position `position` (s) heard at `epoch` (device clock, ms), or paused there. */
export interface StemTimeline {
  playing: boolean;
  position: number;
  epoch: number;
}

/** A stem start is placed again only when it's drifted further than this from where the device's clock says (s). */
const REPLACE_BEYOND = 0.008;
let followedStems: { song: StemSong; timeline: StemTimeline; leader: string } | null = null;

/**
 * Plays the leader's song as they do (loading it first; a device that
 * wasn't ready joins at the current position), with this device's own
 * mutes and solos; called again whenever it or the clocks change. Null:
 * nothing to follow (the leader's stems stopped, or none to play here).
 */
export async function followStems(song: StemSong | null, timeline: StemTimeline | null, leader: string, attempt = 0) {
  if (!song || !timeline) {
    followedStems = null;
    pause();
    return set({ following: leader });
  }
  followedStems = { song, timeline, leader };
  lastSong = song;
  if (state.following !== leader) set({ following: leader });
  if (!(await load(song)) || !context || !clock) return;
  const latest = followedStems;
  if (!latest || stemKey(latest.song) !== stemKey(song)) return;
  const { timeline: now } = latest;
  if (!now.playing) {
    pause();
    offset = Math.min(Math.max(0, now.position), state.duration);
    return set({ position: offset });
  }
  void context.resume();
  if (context.state !== "running") set({ audioBlocked: true });
  const zero = clock.timeOf(now.epoch) - now.position;
  // Already playing it there, within a few milliseconds: left as it is.
  if (state.playing && Math.abs(zero - startedAt) < REPLACE_BEYOND) return;
  const when = Math.max(context.currentTime + 0.1 + latency, zero + now.position);
  const from = when - zero;
  if (from >= state.duration) return pause();
  applyGains(true);
  startAt(from, when, { epoch: now.epoch, position: now.position });
  set({ playing: true, returnTo: song.returnTo, title: song.title });
  updateMediaSession();
  // Just started, the audio clock doesn't say yet when its output is heard: placed again once it does.
  if (!clock.known && attempt < 40) {
    setTimeout(() => {
      if (followedStems?.timeline === now) void followStems(followedStems.song, now, followedStems.leader, attempt + 1);
    }, 250);
  }
}

/** Stops following: the stems stop, and are this device's own again. */
export function unfollowStems() {
  if (!state.following) return;
  followedStems = null;
  pause();
  set({ following: null, audioBlocked: false });
}

/**
 * The stems kept where their anchor on the device's clock says, as the
 * audio and device clocks drift apart (the leader's and the followers').
 */
export function realignStems() {
  if (!context || !clock || !state.playing || !state.anchor) return;
  const zero = clock.timeOf(state.anchor.epoch) - state.anchor.position;
  if (Math.abs(zero - startedAt) < REPLACE_BEYOND) return;
  noteStemsCorrection(zero - startedAt);
  const when = context.currentTime + 0.05 + latency;
  startAt(when - zero, when, state.anchor);
}

const stemsCorrections: { ms: number; at: number }[] = [];
function noteStemsCorrection(seconds: number) {
  stemsCorrections.push({ ms: Math.round(seconds * 10000) / 10, at: Date.now() });
  if (stemsCorrections.length > 10) stemsCorrections.shift();
}

/** What the stems' clock knows of itself, for Sync details (issue #101). */
export function stemsClockReport() {
  return { clock: clock?.report() ?? null, corrections: [...stemsCorrections], anchor: state.anchor, playing: state.playing, following: state.following };
}

/** From a press: lets the browser make sound, then catches up with the leader. */
export function unlockStemsAudio() {
  if (!context) return;
  void context.resume().then(() => {
    if (state.audioBlocked) set({ audioBlocked: false });
    if (followedStems) void followStems(followedStems.song, followedStems.timeline, followedStems.leader);
  });
}

/** The stems as they are now, outside React. */
export function getStemState(): StemState {
  return state;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useStems(): StemState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => EMPTY,
  );
}

// --- recording in the player (issue #134)

/** The take just recorded, as a track, until it's kept or dropped. */
export const TAKE_ID = "__take";

/** The player's audio clock, for the recorder to capture on (so a take lines up with what was heard). */
export function stemsAudioContext(): AudioContext | null {
  return context;
}

/**
 * Plays straight to the speakers from now on: on an iPhone or iPad the
 * stems go through an <audio> element (to play on with the screen
 * locked), whose delay can't be known - a take recorded over them couldn't
 * be lined up.
 */
export function directStemsOutput() {
  directOutput = true;
  if (!context || !bus || !element) return;
  if (streamOut) bus.disconnect(streamOut);
  try {
    bus.disconnect(context.destination);
  } catch {
    // Wasn't connected.
  }
  bus.connect(context.destination);
  element.pause();
  element.srcObject = null;
  element = null;
}

/** When the song's 0:00 is heard, on the audio clock, while it plays; null when it doesn't. */
export function stemsZeroAt(): number | null {
  return state.playing && context ? startedAt : null;
}

/** A part's audio, mono, on the player's clock: what a punch-in keeps the start of. */
export function stemMono(id: string): Float32Array | null {
  const buffer = buffers.get(id);
  if (!buffer) return null;
  const mono = new Float32Array(buffer.length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < mono.length; i++) mono[i]! += data[i]! / buffer.numberOfChannels;
  }
  return mono;
}

/**
 * The take just recorded, as a track the player plays with the others (a
 * new one replaces it); null takes it away.
 */
export async function setStemsTake(take: { samples: Float32Array; part: StemPart; partName: string | null; name: string; offset: number } | null) {
  if (!context || !plain) return;
  const had = gains.get(TAKE_ID);
  had?.disconnect();
  buffers.delete(TAKE_ID);
  gains.delete(TAKE_ID);
  tracksInfo.delete(TAKE_ID);
  let tracks = state.tracks.filter((track) => track.id !== TAKE_ID);
  if (take && take.samples.length > 0) {
    const buffer = context.createBuffer(1, take.samples.length, context.sampleRate);
    buffer.copyToChannel(take.samples as Float32Array<ArrayBuffer>, 0);
    const gain = context.createGain();
    gain.connect(plain);
    buffers.set(TAKE_ID, buffer);
    gains.set(TAKE_ID, gain);
    tracksInfo.set(TAKE_ID, { part: take.part, offset: take.offset });
    tracks = [
      ...tracks,
      { id: TAKE_ID, part: take.part, partName: take.name, by: null, filename: take.name, number: 0, peaks: peaksOf(buffer), length: buffer.duration, offset: take.offset, failed: false, take: true },
    ];
  }
  const duration = Math.max(0, ...[...buffers.values()].map((buffer) => buffer.duration));
  set({ tracks, duration });
  await route();
  applyGains(true);
  // Playing: heard from where it is, the take with it.
  if (state.playing) startAt(now() + 0.05 + latency, context.currentTime + 0.05 + latency);
}
