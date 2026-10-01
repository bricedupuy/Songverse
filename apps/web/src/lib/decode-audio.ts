/**
 * An audio file decoded for Web Audio (issue #185). The browser's own
 * decoder first; Safari before 18.4 (iOS, iPadOS, macOS) can't read Ogg,
 * and everything Songverse records, separates or re-encodes is Opus in Ogg,
 * so then ogg-opus-decoder (WebAssembly) decodes it in workers, loaded only
 * on a device that needs it.
 */
import type { OggOpusDecoderWebWorker } from "ogg-opus-decoder";

/** Ogg Opus: an Ogg page whose first packet is Opus's header. */
export function isOggOpus(bytes: Uint8Array): boolean {
  if (bytes.length < 36 || bytes[0] !== 0x4f || bytes[1] !== 0x67 || bytes[2] !== 0x67 || bytes[3] !== 0x53) return false;
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, Math.min(bytes.length, 200)));
  return head.includes("OpusHead");
}

const FORCE_KEY = "songverse.audio.decoder";
/** The browser refused Ogg Opus once: it will again, so don't ask it twice. */
let nativeRefusesOgg = false;

function forced(): boolean {
  try {
    return localStorage.getItem(FORCE_KEY) === "wasm";
  } catch {
    return false;
  }
}

/** Decodes `data`; Ogg Opus the browser can't read goes to the WebAssembly decoder. */
export async function decodeAudio(context: BaseAudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  const bytes = new Uint8Array(data);
  const ogg = isOggOpus(bytes);
  if (!ogg || (!nativeRefusesOgg && !forced())) {
    try {
      // decodeAudioData takes the buffer over: a copy, while the fallback may still need it.
      return await context.decodeAudioData(ogg ? data.slice(0) : data);
    } catch (error) {
      if (!ogg) throw error;
      nativeRefusesOgg = true;
    }
  }
  return decodeOggOpus(context, bytes);
}

// --- the workers: one fewer than the device's cores (at least one), shared by every file, freed once idle.

type Decoder = OggOpusDecoderWebWorker;
let pool: Promise<Decoder>[] = [];
const idle: Decoder[] = [];
const waiting: ((decoder: Decoder) => void)[] = [];
let freeTimer: ReturnType<typeof setTimeout> | null = null;
const FREE_AFTER_MS = 60_000;

function poolSize(): number {
  const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 2 : 2;
  return Math.max(1, Math.min(4, cores - 1));
}

async function acquire(): Promise<Decoder> {
  if (freeTimer) clearTimeout(freeTimer);
  freeTimer = null;
  const ready = idle.pop();
  if (ready) return ready;
  if (pool.length < poolSize()) {
    const made = import("ogg-opus-decoder").then(async ({ OggOpusDecoderWebWorker }) => {
      const decoder = new OggOpusDecoderWebWorker();
      await decoder.ready;
      return decoder;
    });
    pool.push(made);
    return made;
  }
  return new Promise((resolve) => waiting.push(resolve));
}

function release(decoder: Decoder) {
  const next = waiting.shift();
  if (next) return next(decoder);
  idle.push(decoder);
  if (idle.length === pool.length) {
    freeTimer = setTimeout(() => {
      const all = pool;
      pool = [];
      idle.length = 0;
      void Promise.all(all.map(async (made) => (await made).free()));
    }, FREE_AFTER_MS);
  }
}

async function decodeOggOpus(context: BaseAudioContext, bytes: Uint8Array): Promise<AudioBuffer> {
  const decoder = await acquire();
  try {
    const { channelData, samplesDecoded, sampleRate } = await decoder.decodeFile(bytes);
    await decoder.reset();
    if (!samplesDecoded || channelData.length === 0) throw new Error("No sound in it");
    const buffer = context.createBuffer(channelData.length, samplesDecoded, sampleRate);
    channelData.forEach((channel, index) => buffer.copyToChannel(channel.subarray(0, samplesDecoded) as Float32Array<ArrayBuffer>, index));
    probe();
    return buffer;
  } finally {
    release(decoder);
  }
}

/** For the end-to-end tests: how many files went through the WebAssembly decoder. */
function probe() {
  if (typeof window === "undefined") return;
  const w = window as unknown as { songverseDecoder?: { fallback: number } };
  w.songverseDecoder ??= { fallback: 0 };
  w.songverseDecoder.fallback++;
}
