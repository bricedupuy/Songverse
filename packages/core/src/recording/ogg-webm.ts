/**
 * Ogg Opus rewrapped as WebM, without decoding it (issue #185). Everything
 * Songverse records, separates or re-encodes is Opus in Ogg, which Safari
 * couldn't decode before 18.4 - but it decodes Opus in WebM (15+). The Opus
 * packets are the same in both: this reads them out of the Ogg pages and
 * writes them into a minimal WebM, laid out as ffmpeg lays one out, for the
 * browser's own decoder. A few milliseconds, and memory about the file's
 * size: nothing is decoded here.
 */

/** Opus always runs at 48 kHz: timings in samples are at that rate. */
const RATE = 48_000;

export interface OggOpusStream {
  /** The OpusHead packet, as WebM's CodecPrivate wants it. */
  head: Uint8Array;
  channels: number;
  /** Samples to drop at the start (the encoder's delay). */
  preSkip: number;
  /** The audio packets, in order. */
  packets: Uint8Array[];
  /** The last page's granule position: the samples there are, the pre-skip included; null when unknown. */
  endGranule: number | null;
}

/**
 * The first Opus stream of an Ogg file: its header and audio packets, put
 * back together across pages. Null when it isn't Ogg Opus.
 */
export function readOggOpus(bytes: Uint8Array): OggOpusStream | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const packets: Uint8Array[] = [];
  let serial: number | null = null;
  let pending: Uint8Array[] = [];
  let endGranule: number | null = null;
  let at = 0;
  while (at + 27 <= bytes.length) {
    if (bytes[at] !== 0x4f || bytes[at + 1] !== 0x67 || bytes[at + 2] !== 0x67 || bytes[at + 3] !== 0x53) return null;
    const granuleLow = view.getUint32(at + 6, true);
    const granuleHigh = view.getInt32(at + 10, true);
    const pageSerial = view.getUint32(at + 14, true);
    const segments = bytes[at + 26]!;
    if (at + 27 + segments > bytes.length) return null;
    const table = bytes.subarray(at + 27, at + 27 + segments);
    let body = at + 27 + segments;
    const pageEnd = body + table.reduce((sum, size) => sum + size, 0);
    if (pageEnd > bytes.length) return null;
    serial ??= pageSerial;
    // Another stream interleaved (not something ffmpeg writes for us): its pages are skipped.
    if (pageSerial === serial) {
      for (const size of table) {
        pending.push(bytes.subarray(body, body + size));
        body += size;
        // A segment shorter than 255 bytes ends a packet; 255 goes on in the next.
        if (size < 255) {
          packets.push(join(pending));
          pending = [];
        }
      }
      // -1 (all bits set): no packet ends on this page.
      if (!(granuleLow === 0xffffffff && granuleHigh === -1)) endGranule = granuleHigh * 2 ** 32 + granuleLow;
    }
    at = pageEnd;
  }
  const head = packets[0];
  if (!head || head.length < 19 || new TextDecoder().decode(head.subarray(0, 8)) !== "OpusHead") return null;
  const headView = new DataView(head.buffer, head.byteOffset, head.byteLength);
  // The packets after OpusHead and OpusTags are the audio.
  return { head, channels: head[9]!, preSkip: headView.getUint16(10, true), packets: packets.slice(2), endGranule };
}

function join(parts: Uint8Array[]): Uint8Array {
  if (parts.length === 1) return parts[0]!;
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** How many samples (at 48 kHz) an Opus packet holds, from its first byte (RFC 6716, 3.1). */
export function opusPacketSamples(packet: Uint8Array): number {
  if (packet.length === 0) return 0;
  const toc = packet[0]!;
  const config = toc >> 3;
  // SILK (0-11): 10, 20, 40 or 60 ms; hybrid (12-15): 10 or 20 ms; CELT (16-31): 2.5, 5, 10 or 20 ms.
  const frame = config < 12 ? [480, 960, 1920, 2880][config % 4]! : config < 16 ? [480, 960][config % 2]! : [120, 240, 480, 960][config % 4]!;
  const code = toc & 3;
  const frames = code === 0 ? 1 : code < 3 ? 2 : packet.length > 1 ? packet[1]! & 0x3f : 0;
  return frame * frames;
}

// --- WebM (Matroska): EBML elements, each an ID, its size and its content.

type Part = Uint8Array | number[];

function size(n: number): number[] {
  // The shortest length that holds it (all ones is kept for "unknown").
  for (let length = 1; length <= 8; length++) {
    if (n < 2 ** (7 * length) - 1) {
      const out: number[] = [];
      let rest = n;
      for (let i = length - 1; i >= 0; i--) {
        out[i] = rest % 256;
        rest = Math.floor(rest / 256);
      }
      out[0]! |= 1 << (8 - length);
      return out;
    }
  }
  throw new Error("Too big for WebM");
}

function idBytes(id: number): number[] {
  const out: number[] = [];
  for (let rest = id; rest > 0; rest = Math.floor(rest / 256)) out.unshift(rest % 256);
  return out;
}

function element(id: number, ...content: Part[]): Uint8Array[] {
  const length = content.reduce((sum, part) => sum + part.length, 0);
  return [Uint8Array.from([...idBytes(id), ...size(length)]), ...content.map((part) => (part instanceof Uint8Array ? part : Uint8Array.from(part)))];
}

const flat = (parts: Uint8Array[]): Uint8Array => join(parts);

function uint(id: number, value: number): Uint8Array[] {
  const out: number[] = [];
  for (let rest = Math.round(value); rest > 0 || out.length === 0; rest = Math.floor(rest / 256)) out.unshift(rest % 256);
  return element(id, out);
}

function int(id: number, value: number): Uint8Array[] {
  // Two's complement, 8 bytes.
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigInt64(0, BigInt(Math.round(value)));
  return element(id, out);
}

function float(id: number, value: number): Uint8Array[] {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setFloat64(0, value);
  return element(id, out);
}

const text = (id: number, value: string) => element(id, new TextEncoder().encode(value));
const parent = (id: number, ...children: Uint8Array[][]) => element(id, flat(children.flat()));

/** A cluster of blocks lasts at most this long (a block's time within it is a signed 16-bit count of ms). */
const CLUSTER_MS = 5000;
/** How much Opus decodes before a seek to settle (Matroska's advice for Opus). */
const SEEK_PRE_ROLL_NS = 80_000_000;

/**
 * An Ogg Opus file rewrapped as WebM: the same packets, the same start delay
 * (CodecDelay, the first block placed that far before 0 as ffmpeg does) and
 * the same end (DiscardPadding on the last packet). Null when it isn't Ogg Opus.
 */
export function oggOpusToWebm(bytes: Uint8Array): Uint8Array | null {
  const stream = readOggOpus(bytes);
  if (!stream || stream.packets.length === 0) return null;
  const durations = stream.packets.map(opusPacketSamples);
  const total = durations.reduce((sum, samples) => sum + samples, 0);
  // Decoded beyond the last granule: padding the encoder added, dropped from the last packet.
  const padding = stream.endGranule !== null ? Math.max(0, total - stream.endGranule) : 0;
  // Half a millisecond away from zero, as ffmpeg rounds.
  const ms = (samples: number) => Math.sign(samples) * Math.round(Math.abs(samples * 1000) / RATE);

  const clusters: Uint8Array[][] = [];
  let blocks: Uint8Array[][] = [];
  let clusterStart = 0;
  let position = -stream.preSkip;
  const close = () => {
    if (blocks.length) clusters.push(parent(0x1f43b675, uint(0xe7, Math.max(0, clusterStart)), ...blocks));
    blocks = [];
  };
  stream.packets.forEach((packet, index) => {
    const time = ms(position);
    if (blocks.length === 0 || time - clusterStart >= CLUSTER_MS) {
      close();
      // A cluster's time can't be negative: the first one starts at 0, its first block a little before.
      clusterStart = Math.max(0, time);
    }
    const relative = new Uint8Array(2);
    new DataView(relative.buffer).setInt16(0, time - clusterStart);
    const header = Uint8Array.from([0x81, relative[0]!, relative[1]!]);
    const last = index === stream.packets.length - 1;
    if (last && padding > 0) {
      // The last packet in a BlockGroup, with what to drop from its end.
      blocks.push(parent(0xa0, element(0xa1, header, [0x00], packet), int(0x75a2, (padding * 1e9) / RATE)));
    } else {
      // A SimpleBlock: track 1, its time in the cluster, a keyframe (every Opus packet stands alone).
      blocks.push(element(0xa3, header, [0x80], packet));
    }
    position += durations[index]!;
  });
  close();

  const ebml = parent(0x1a45dfa3, uint(0x4286, 1), uint(0x42f7, 1), uint(0x42f2, 4), uint(0x42f3, 8), text(0x4282, "webm"), uint(0x4287, 4), uint(0x4285, 2));
  const info = parent(0x1549a966, uint(0x2ad7b1, 1_000_000), text(0x4d80, "Songverse"), text(0x5741, "Songverse"), float(0x4489, ms(total - stream.preSkip - padding)));
  const track = parent(
    0xae,
    uint(0xd7, 1),
    uint(0x73c5, 1),
    uint(0x9c, 0),
    text(0x86, "A_OPUS"),
    element(0x63a2, stream.head),
    uint(0x56aa, Math.round((stream.preSkip * 1e9) / RATE)),
    uint(0x56bb, SEEK_PRE_ROLL_NS),
    uint(0x83, 2),
    parent(0xe1, float(0xb5, RATE), uint(0x9f, stream.channels)),
  );
  const segment = parent(0x18538067, info, parent(0x1654ae6b, track), ...clusters);
  return flat([...ebml, ...segment]);
}
