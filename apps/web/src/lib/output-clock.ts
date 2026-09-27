/**
 * An audio clock against the device's own (Sync play, issues #13, #100),
 * for the metronome and the stems alike: when a time on an AudioContext's
 * clock is heard, on the device's clock (ms since the epoch), and back.
 *
 * The output timestamp pairs the sample being heard with the device's
 * clock (so the output's delay is counted), but a reading can come a
 * little late when the page is busy - never early. So: read often, and
 * keep the earliest pairing of the last few seconds (the clocks drift
 * apart too slowly to matter over that). Each reading is checked against
 * the audio clock's own time, and one far from it isn't believed (issue
 * #102); without the output timestamp, the audio clock's own time and the
 * browser's measure of the output delay, read the same way.
 */

/** This device's clock, ms since the epoch: steady, unlike Date.now(). */
export const deviceNow = () => performance.timeOrigin + performance.now();

const WINDOW_MS = 3000;
/**
 * How far the output timestamp may disagree with the audio clock's own time
 * (its output delay, and a block or two) before it's not believed: an
 * older WebKit (iOS 17 on an iPad 6th gen, issue #102) reports it on
 * another timeline, minutes away.
 */
const PLAUSIBLE_MS = 250;

/** What the clock knows of itself, for Sync details (issue #101). */
export interface OutputClockReport {
  state: AudioContextState;
  /** performance.now() at which audio time 0 is heard: from the output timestamp, and from the audio clock's own time. */
  stampLag: number | null;
  plainLag: number | null;
  /** The output timestamp is used (else the audio clock's own time, with the browser's delay). */
  trusted: boolean;
  /** Output timestamp readings not believed so far. */
  rejected: number;
  outputLatency: number;
  baseLatency: number;
}

export class OutputClock {
  // Each a performance.now() at which audio time 0 is heard: from the output
  // timestamp, and from the audio clock's own time. A reading can only come
  // late (the page busy, the clock a block behind), so the earliest counts.
  private stamps: { at: number; lag: number }[] = [];
  private plain: { at: number; lag: number }[] = [];
  private rejected = 0;
  /** When the clock was first read running (performance.now()). */
  private runningSince: number | null = null;
  private readonly timer: ReturnType<typeof setInterval>;

  constructor(private readonly ctx: AudioContext) {
    this.timer = setInterval(() => this.read(), 50);
  }

  /** Stops reading (the context is being closed). */
  dispose() {
    clearInterval(this.timer);
  }

  /**
   * Placements from here on are the clock's own: the output timestamp has
   * been read and believed - or, after a second of the clock running
   * without one (none here, or none believable), the audio clock's own time.
   */
  get known(): boolean {
    this.read();
    if (this.stamps.length > 0) return true;
    return this.runningSince !== null && performance.now() - this.runningSince > 1000;
  }

  private read() {
    // A stopped clock (suspended, or before it starts) says nothing.
    if (this.ctx.state !== "running" || !this.ctx.currentTime) return;
    const now = performance.now();
    this.runningSince ??= now;
    const plain = now - this.ctx.currentTime * 1000 + this.delay() * 1000;
    this.plain = keep(this.plain, now, plain);
    const stamp = this.ctx.getOutputTimestamp?.();
    if (!stamp?.contextTime || !stamp.performanceTime) return;
    const lag = stamp.performanceTime - stamp.contextTime * 1000;
    if (Math.abs(lag - earliest(this.plain)!) > PLAUSIBLE_MS) {
      this.rejected++;
      return;
    }
    this.stamps = keep(this.stamps, now, lag);
  }

  /** performance.now() at which audio time 0 is heard, or null before the clock runs. */
  private lag(): number | null {
    this.read();
    return earliest(this.stamps) ?? earliest(this.plain);
  }

  private delay() {
    return this.ctx.outputLatency || this.ctx.baseLatency || 0;
  }

  /** When a time on the audio clock is heard, on the device's clock. */
  epochOf(time: number): number {
    const lag = this.lag();
    if (lag !== null) return performance.timeOrigin + lag + time * 1000;
    return deviceNow() + (time - this.ctx.currentTime + this.delay()) * 1000;
  }

  /** The audio clock's time to schedule a sound at, for it to be heard at `epoch` (device clock, ms). */
  timeOf(epoch: number): number {
    const lag = this.lag();
    if (lag !== null) return (epoch - performance.timeOrigin - lag) / 1000;
    return this.ctx.currentTime + (epoch - deviceNow()) / 1000 - this.delay();
  }

  report(): OutputClockReport {
    this.read();
    return {
      state: this.ctx.state,
      stampLag: earliest(this.stamps),
      plainLag: earliest(this.plain),
      trusted: this.stamps.length > 0,
      rejected: this.rejected,
      outputLatency: this.ctx.outputLatency ?? 0,
      baseLatency: this.ctx.baseLatency ?? 0,
    };
  }
}

function keep(list: { at: number; lag: number }[], now: number, lag: number) {
  list.push({ at: now, lag });
  return list[0]!.at < now - WINDOW_MS ? list.filter((entry) => entry.at >= now - WINDOW_MS) : list;
}

function earliest(list: { at: number; lag: number }[]): number | null {
  let lag: number | null = null;
  for (const entry of list) if (lag === null || entry.lag < lag) lag = entry.lag;
  return lag;
}
