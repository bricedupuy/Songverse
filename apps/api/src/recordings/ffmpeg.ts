import { spawn } from "node:child_process";
import { encodeWav } from "@songverse/core";

/**
 * ffmpeg, for a recorded take (issue #127): run in the Worker, on files
 * in a temporary folder. A take's start is what lines it up with the rest
 * of its multitrack, so nothing here may move it: the silence trimmed is
 * the silence after the end, and a filter that delays the sound (the
 * noise reduction) has its delay measured and taken off.
 */

const FFMPEG = "ffmpeg";
/** A take is a few minutes of audio at most: a run that takes longer than this has hung. */
const RUN_TIMEOUT_MS = 5 * 60 * 1000;

export class FfmpegMissingError extends Error {
  constructor() {
    super("ffmpeg isn't installed where the background jobs run: recordings stay as WAV");
  }
}

/** Runs ffmpeg; resolves with what it wrote to stdout and stderr. */
export function runFfmpeg(args: string[], input?: Buffer): Promise<{ stdout: Buffer; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG, ["-hide_banner", "-nostdin", ...args], { stdio: [input ? "pipe" : "ignore", "pipe", "pipe"] });
    const out: Buffer[] = [];
    let err = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), RUN_TIMEOUT_MS);
    child.stdout?.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => {
      // Only the end matters (the error, or loudnorm's measurements).
      err = (err + chunk.toString()).slice(-20000);
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(error.code === "ENOENT" ? new FfmpegMissingError() : error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout: Buffer.concat(out), stderr: err });
      else reject(new Error(`ffmpeg failed (${code ?? "killed"}): ${err.trim().split("\n").slice(-3).join(" ")}`));
    });
    if (input && child.stdin) {
      child.stdin.on("error", () => undefined);
      child.stdin.end(input);
    }
  });
}

/** ffmpeg's version ("7.1.1"), or null when it isn't installed: for Admin. */
export async function ffmpegVersion(): Promise<string | null> {
  try {
    const { stdout } = await runFfmpeg(["-version"]);
    return /ffmpeg version (\S+)/.exec(stdout.toString())?.[1] ?? "unknown";
  } catch {
    return null;
  }
}

/** Trailing silence, trimmed down to 0.3 s: reversed, so only the end is looked at. */
const TRIM_END = "areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.3,areverse";
// afftdn: spectral noise reduction, for steady noise; gentle (12 dB), so the music is left alone.
const DENOISE_OPTIONS = "nr=12:nf=-40";
const DENOISE = `afftdn=${DENOISE_OPTIONS}:tn=1`;
const LOUDNESS = "I=-16:TP=-1.5:LRA=11";

/**
 * How late the noise reduction makes the sound (samples), at `sampleRate`:
 * a burst half a second into a quiet file, found again after the filter.
 */
export async function denoiseDelay(sampleRate: number): Promise<number> {
  const samples = new Float32Array(sampleRate * 2);
  let seed = 1;
  for (let i = 0; i < samples.length; i++) {
    seed = (seed * 16807) % 2147483647;
    samples[i] = (seed / 2147483647 - 0.5) * 0.006;
  }
  const at = sampleRate / 2;
  for (let i = 0; i < sampleRate / 100; i++) samples[at + i] = 0.6 * Math.sin((2 * Math.PI * 1000 * i) / sampleRate);
  const { stdout } = await runFfmpeg(["-f", "wav", "-i", "pipe:0", "-af", DENOISE, "-f", "s16le", "-ac", "1", "pipe:1"], Buffer.from(encodeWav(samples, sampleRate)));
  const pcm = new Int16Array(stdout.buffer, stdout.byteOffset, Math.floor(stdout.length / 2));
  let peak = 0;
  for (const value of pcm) peak = Math.max(peak, Math.abs(value));
  const found = pcm.findIndex((value) => Math.abs(value) > peak * 0.3);
  return found < 0 ? 0 : Math.max(0, found - at);
}

/** A WAV file's sample rate, from its header. */
export function wavSampleRate(wav: Buffer): number | null {
  return wav.length >= 44 && wav.toString("ascii", 0, 4) === "RIFF" && wav.toString("ascii", 8, 12) === "WAVE" ? wav.readUInt32LE(24) : null;
}

export interface TakeProcessing {
  /** Even out the level: EBU R128 loudness normalisation, measured first (two passes). */
  level: boolean;
  /** Reduce steady background noise (hiss, hum, a fan). */
  noise: boolean;
  /**
   * How long the take is quiet at its start (s): the count-in, before its
   * first beat. The room's noise is learnt from it - better than guessing,
   * for music - when there's enough (0.4 s); otherwise it's followed as the
   * take goes.
   */
  quietFor?: number | null;
}

/**
 * A take as the browser recorded it (WAV) turned into Ogg Opus, mono,
 * 96 kbps: its trailing silence trimmed, its noise reduced and level
 * evened out if asked. Its start stays where it was, to the sample.
 */
export async function processTake(wav: Buffer, dir: string, options: TakeProcessing): Promise<Buffer> {
  const sampleRate = wavSampleRate(wav);
  if (!sampleRate) throw new Error("Not a WAV file");
  const { writeFile, readFile } = await import("node:fs/promises");
  const input = `${dir}/take.wav`;
  const output = `${dir}/take.opus`;
  await writeFile(input, wav);
  const filters = [TRIM_END];
  if (options.noise) {
    const delay = await denoiseDelay(sampleRate);
    const quiet = Math.min(options.quietFor ?? 0, 3) - 0.1;
    // The noise learnt from the count-in (a moment in, and before the first beat), else tracked.
    if (quiet >= 0.3) filters.push(`asendcmd=c='0.05 afftdn@dn sample_noise start; ${quiet.toFixed(3)} afftdn@dn sample_noise stop'`, `afftdn@dn=${DENOISE_OPTIONS}`);
    else filters.push(DENOISE);
    // Its delay taken off: the take starts where it did.
    if (delay > 0) filters.push(`atrim=start_sample=${delay}`, "asetpts=PTS-STARTPTS");
  }
  if (options.level) {
    const { stderr } = await runFfmpeg(["-i", input, "-af", [...filters, `loudnorm=${LOUDNESS}:print_format=json`].join(","), "-f", "null", "-"]);
    const json = /\{[^{}]*"input_i"[^{}]*\}/.exec(stderr)?.[0];
    const measured = json ? (JSON.parse(json) as Record<string, string>) : null;
    // Silence (or too short to measure) gives -inf: nothing to even out.
    if (measured && Number.isFinite(Number(measured.input_i))) {
      filters.push(
        `loudnorm=${LOUDNESS}:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true`,
      );
    }
  }
  await runFfmpeg(["-y", "-i", input, "-af", filters.join(","), "-ar", "48000", "-ac", "1", "-c:a", "libopus", "-b:a", "96k", "-f", "ogg", output]);
  return readFile(output);
}
