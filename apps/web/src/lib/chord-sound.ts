/**
 * A chord heard when its diagram is tapped (issue #207): each string a
 * plucked string (Karplus-Strong - a burst of noise fed round a short delay
 * that fades as it's smoothed), strummed a few milliseconds apart, down on
 * one tap and up on the next. Made on the device, so it works offline;
 * what's heard is the shape's own notes, so it always matches the drawing.
 */

let context: AudioContext | null = null;
const plucks = new Map<number, AudioBuffer>();

function audio(): AudioContext {
  context ??= new AudioContext({ latencyHint: "interactive" });
  if (context.state === "suspended") void context.resume();
  return context;
}

/** One plucked string, made once per note: the same noise every time (seeded), so a chord always sounds the same. */
function pluck(ctx: AudioContext, midi: number): AudioBuffer {
  const made = plucks.get(midi);
  if (made) return made;
  const rate = ctx.sampleRate;
  const period = Math.max(2, Math.round(rate / (440 * 2 ** ((midi - 69) / 12))));
  const length = Math.round(rate * 2.5);
  const buffer = ctx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  const ring = new Float32Array(period);
  let seed = midi * 7919 + 1;
  for (let i = 0; i < period; i++) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    ring[i] = (seed / 2147483648) * 2 - 1;
  }
  // Higher strings fade sooner, as they do.
  const decay = 0.998 - Math.max(0, midi - 52) * 0.00005;
  let at = 0;
  for (let i = 0; i < length; i++) {
    const next = (at + 1) % period;
    const value = ring[at]!;
    data[i] = value;
    ring[at] = decay * 0.5 * (value + ring[next]!);
    at = next;
  }
  // No click at the end.
  const fade = Math.round(rate * 0.08);
  for (let i = 0; i < fade; i++) data[length - 1 - i]! *= i / fade;
  plucks.set(midi, buffer);
  return buffer;
}

let current: { output: GainNode; at: number } | null = null;

/** Strums `notes` (MIDI, lowest string first): downwards, or upwards with `up`. A new strum stops the last. */
export function strum(notes: number[], { up = false, gap = 0.028 }: { up?: boolean; gap?: number } = {}): void {
  if (notes.length === 0) return;
  const ctx = audio();
  const start = ctx.currentTime + 0.01;
  if (current) {
    // Damp the last strum quickly rather than cutting it.
    current.output.gain.setTargetAtTime(0, start, 0.03);
  }
  const output = ctx.createGain();
  output.gain.value = 0.5 / Math.sqrt(notes.length);
  output.connect(ctx.destination);
  (up ? [...notes].reverse() : notes).forEach((note, i) => {
    const source = ctx.createBufferSource();
    source.buffer = pluck(ctx, note);
    source.connect(output);
    source.start(start + i * gap);
  });
  current = { output, at: start };
}

const tones = new Map<number, AudioBuffer>();

/**
 * One piano-like note, made once: a few harmonics, the higher ones fading
 * sooner, after a quick attack - not a real piano, but clearly a struck
 * string, and the same every time.
 */
function pianoTone(ctx: AudioContext, midi: number): AudioBuffer {
  const made = tones.get(midi);
  if (made) return made;
  const rate = ctx.sampleRate;
  const frequency = 440 * 2 ** ((midi - 69) / 12);
  const length = Math.round(rate * 2.2);
  const buffer = ctx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  const harmonics = [1, 0.45, 0.25, 0.12, 0.07, 0.04];
  for (let i = 0; i < length; i++) {
    const time = i / rate;
    let value = 0;
    harmonics.forEach((level, h) => {
      const partial = frequency * (h + 1);
      if (partial < rate / 2) value += level * Math.exp(-time * (1.6 + h * 1.4)) * Math.sin(2 * Math.PI * partial * time);
    });
    const attack = Math.min(1, time / 0.004);
    data[i] = value * attack * 0.5;
  }
  const fade = Math.round(rate * 0.08);
  for (let i = 0; i < fade; i++) data[length - 1 - i]! *= i / fade;
  tones.set(midi, buffer);
  return buffer;
}

/** Plays a piano voicing (issue #207 phase 4): the left hand's bass, then the right hand's chord a moment later. A new chord stops the last. */
export function playPiano(left: number[], right: number[]): void {
  const notes = [...left, ...right];
  if (notes.length === 0) return;
  const ctx = audio();
  const start = ctx.currentTime + 0.01;
  if (current) current.output.gain.setTargetAtTime(0, start, 0.03);
  const output = ctx.createGain();
  output.gain.value = 0.6 / Math.sqrt(notes.length);
  output.connect(ctx.destination);
  notes.forEach((note, i) => {
    const source = ctx.createBufferSource();
    source.buffer = pianoTone(ctx, note);
    source.connect(output);
    source.start(start + (i < left.length ? 0 : left.length > 0 ? 0.035 : 0) + (i >= left.length ? (i - left.length) * 0.008 : 0));
  });
  current = { output, at: start };
}
