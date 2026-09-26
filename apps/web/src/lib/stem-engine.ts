import { STEM_PARTS, type Attachment, type StemPart } from "@songverse/core";
import { useSyncExternalStore } from "react";

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
}

export interface StemTrack {
  id: string;
  /** Null: a whole recording, played when the song has no stems. */
  part: StemPart | null;
  filename: string;
  /** 1, 2… when two files are the same part ("Guitar 1"), else 0. */
  number: number;
  /** The waveform, 0-1 per slice; null until decoded. */
  peaks: number[] | null;
  failed: boolean;
}

export interface StemState {
  /** What's loaded: which song, and which files (a part reassigned is another set of stems). */
  key: string | null;
  songVersionId: string | null;
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
}

const PEAK_SLICES = 400;

const EMPTY: StemState = {
  key: null,
  songVersionId: null,
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
};

let state: StemState = EMPTY;
const listeners = new Set<() => void>();
let context: AudioContext | null = null;
// Where every part goes: the speakers, or on iPhone and iPad an <audio> element (see outputFor).
let bus: GainNode | null = null;
let element: HTMLAudioElement | null = null;
// The song last played, for the lock screen's Play button.
let lastSong: StemSong | null = null;
let buffers = new Map<string, AudioBuffer>();
let gains = new Map<string, GainNode>();
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

/** A song's stems in the player's order: by part, then by name. */
export function stemsOf(attachments: Attachment[]): (Attachment & { stemPart: StemPart })[] {
  return attachments
    .filter((file): file is Attachment & { stemPart: StemPart } => file.type === "AUDIO" && file.stemPart !== null)
    .sort((a, b) => STEM_PARTS.indexOf(a.stemPart) - STEM_PARTS.indexOf(b.stemPart) || a.filename.localeCompare(b.filename));
}

/**
 * What the player plays for a song (issue #66): its stems, or when it has
 * none its latest whole recording, or nothing.
 */
export function playableOf(attachments: Attachment[]): StemFile[] {
  const stems = stemsOf(attachments);
  if (stems.length > 0) return stems;
  const [latest] = attachments.filter((file) => file.type === "AUDIO").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return latest ? [latest] : [];
}

export function stemKey(song: Pick<StemSong, "songVersionId" | "stems">): string {
  return `${song.songVersionId}|${song.stems.map((stem) => `${stem.id}:${stem.stemPart}`).join()}`;
}

/** Tracks as listed before anything is decoded. */
export function tracksOf(stems: StemFile[]): StemTrack[] {
  return stems.map((stem) => {
    const same = stems.filter((other) => other.stemPart === stem.stemPart);
    return {
      id: stem.id,
      part: stem.stemPart,
      filename: stem.filename,
      number: same.length > 1 ? same.indexOf(stem) + 1 : 0,
      peaks: null,
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

function startAt(from: number) {
  if (!context) return;
  stopSources();
  stopTimer();
  // A moment ahead, so every part is scheduled before the first one starts.
  const when = context.currentTime + 0.05;
  for (const [id, buffer] of buffers) {
    const gain = gains.get(id);
    if (!gain || from >= buffer.duration) continue;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    source.start(when, from);
    sources.push(source);
  }
  startedAt = when - from;
  // A timer rather than animation frames, which stop in a background tab.
  timer = setInterval(() => {
    const at = now();
    if (at >= state.duration) {
      stopSources();
      stopTimer();
      offset = 0;
      element?.pause();
      set({ playing: false, position: 0 });
      updateMediaSession();
    } else {
      set({ position: at });
    }
  }, 100);
}

/**
 * iOS suspends Web Audio when the screen locks, but lets a media element
 * play on: there the parts are mixed into a stream an <audio> element
 * plays, in the "playback" audio session (which the ring/silent switch
 * doesn't mute either). Elsewhere they go straight to the speakers.
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
  if (viaElement() && typeof ctx.createMediaStreamDestination === "function") {
    const stream = ctx.createMediaStreamDestination();
    mix.connect(stream);
    element = new Audio();
    element.setAttribute("playsinline", "");
    element.srcObject = stream.stream;
  } else {
    mix.connect(ctx.destination);
  }
  return mix;
}

/** The element refused to play (no gesture, say): straight to the speakers instead. */
async function startElement() {
  if (!element || !bus || !context) return;
  try {
    await element.play();
  } catch {
    bus.disconnect();
    bus.connect(context.destination);
    element = null;
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
    if (document.visibilityState === "visible" && state.playing && context && context.state !== "running") void context.resume();
  });
}

/** Forgets the loaded song and frees its audio. */
export function unloadStems() {
  generation++;
  stopSources();
  stopTimer();
  void context?.close().catch(() => {});
  context = null;
  bus = null;
  element?.pause();
  if (element) element.srcObject = null;
  element = null;
  buffers = new Map();
  gains = new Map();
  offset = 0;
  set({ ...EMPTY, docked: state.docked });
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
  const mix = outputFor(ctx);
  bus = mix;
  set({
    key,
    songVersionId: song.songVersionId,
    title: song.title,
    returnTo: song.returnTo,
    status: "loading",
    downloaded: 0,
    tracks: tracksOf(song.stems),
    muted,
    soloed,
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
      try {
        const blob = await song.load(stem, (bytes, total) => progress(stem.id, bytes, total));
        progress(stem.id, blob.size, blob.size, true);
        buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
      } catch {
        // Shown on its row; the other parts still play.
      }
      return { stem, buffer };
    }),
  );
  if (mine !== generation) return false;
  for (const { stem, buffer } of decoded) {
    if (!buffer) continue;
    const gain = ctx.createGain();
    gain.connect(mix);
    buffers.set(stem.id, buffer);
    gains.set(stem.id, gain);
  }
  const peaks = new Map(decoded.map(({ stem, buffer }) => [stem.id, buffer ? peaksOf(buffer) : null]));
  const tracks = state.tracks.map((track) => ({ ...track, peaks: peaks.get(track.id) ?? null, failed: !peaks.get(track.id) }));
  if (buffers.size === 0) {
    set({ status: "error", tracks });
    return false;
  }
  set({ status: "ready", tracks, duration: Math.max(...[...buffers.values()].map((buffer) => buffer.duration)) });
  return true;
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
  if (!state.playing) return;
  offset = now();
  stopSources();
  stopTimer();
  element?.pause();
  set({ playing: false, position: offset });
  updateMediaSession();
}

export function seekStems(to: number) {
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
