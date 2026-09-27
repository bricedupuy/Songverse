/**
 * An audio clock against the device's own (Sync play, issues #13, #100),
 * for the metronome and the stems alike: when a time on an AudioContext's
 * clock is heard, on the device's clock (ms since the epoch), and back.
 *
 * The output timestamp pairs the sample being heard with the device's
 * clock (so the output's delay is counted), but a reading can come a
 * little late when the page is busy - never early. So: read often, and
 * keep the earliest pairing of the last few seconds (the clocks drift
 * apart too slowly to matter over that). Until the output says (a new
 * context, for a moment), the browser's own measure of the delay.
 */

/** This device's clock, ms since the epoch: steady, unlike Date.now(). */
export const deviceNow = () => performance.timeOrigin + performance.now();

const WINDOW_MS = 3000;

export class OutputClock {
  private pairings: { at: number; lag: number }[] = [];
  private readonly timer: ReturnType<typeof setInterval>;

  constructor(private readonly ctx: AudioContext) {
    this.timer = setInterval(() => this.read(), 50);
  }

  /** Stops reading (the context is being closed). */
  dispose() {
    clearInterval(this.timer);
  }

  /** The output has said when it plays: placements from here on are its own. */
  get known(): boolean {
    this.read();
    return this.pairings.length > 0;
  }

  private read() {
    const stamp = this.ctx.getOutputTimestamp?.();
    if (!stamp?.contextTime || !stamp.performanceTime) return;
    const now = performance.now();
    this.pairings.push({ at: now, lag: stamp.performanceTime - stamp.contextTime * 1000 });
    if (this.pairings[0]!.at < now - WINDOW_MS) this.pairings = this.pairings.filter((pairing) => pairing.at >= now - WINDOW_MS);
  }

  /** performance.now() at which audio time 0 is heard, or null before the output says. */
  private lag(): number | null {
    this.read();
    let lag: number | null = null;
    for (const pairing of this.pairings) if (lag === null || pairing.lag < lag) lag = pairing.lag;
    return lag;
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
}
