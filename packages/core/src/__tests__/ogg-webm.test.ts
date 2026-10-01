import { describe, expect, it } from "vite-plus/test";
import { oggOpusToWebm, opusPacketSamples, readOggOpus } from "../index.js";

/** An Ogg page: one stream, its packets cut into 255-byte segments. */
function page(packets: Uint8Array[], granule: bigint, sequence: number, continued = false): Uint8Array {
  const table: number[] = [];
  for (const packet of packets) {
    let rest = packet.length;
    while (rest >= 255) {
      table.push(255);
      rest -= 255;
    }
    table.push(rest);
  }
  const body = packets.reduce((sum, packet) => sum + packet.length, 0);
  const out = new Uint8Array(27 + table.length + body);
  const view = new DataView(out.buffer);
  out.set([0x4f, 0x67, 0x67, 0x53, 0, continued ? 1 : 0]);
  view.setBigInt64(6, granule, true);
  view.setUint32(14, 1234, true);
  view.setUint32(18, sequence, true);
  out[26] = table.length;
  out.set(table, 27);
  let at = 27 + table.length;
  for (const packet of packets) {
    out.set(packet, at);
    at += packet.length;
  }
  return out;
}

const head = Uint8Array.from([...new TextEncoder().encode("OpusHead"), 1, 2, 0x38, 0x01, 0x80, 0xbb, 0, 0, 0, 0, 0]);
const tags = new TextEncoder().encode("OpusTags\0\0\0\0\0\0\0\0");
/** A 20 ms CELT packet (config 31, one frame), `size` bytes. */
const packet = (size: number, fill: number) => Uint8Array.from({ length: size }, (_, i) => (i === 0 ? 0xf8 : fill));

function file(audio: Uint8Array[], endGranule: bigint): Uint8Array {
  // At most 50 packets a page (a page has 255 segments at most).
  const pages = [page([head], 0n, 0), page([tags], 0n, 1)];
  for (let at = 0; at < audio.length; at += 50) pages.push(page(audio.slice(at, at + 50), at + 50 >= audio.length ? endGranule : BigInt((at + 50) * 960), pages.length));
  const out = new Uint8Array(pages.reduce((sum, one) => sum + one.length, 0));
  let at = 0;
  for (const one of pages) {
    out.set(one, at);
    at += one.length;
  }
  return out;
}

/** Where `needle` is in `bytes`, -1 if nowhere. */
function find(bytes: Uint8Array, needle: number[]): number {
  outer: for (let i = 0; i + needle.length <= bytes.length; i++) {
    for (let j = 0; j < needle.length; j++) if (bytes[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

describe("Ogg Opus rewrapped as WebM (issue #185)", () => {
  it("counts an Opus packet's samples from its first byte", () => {
    expect(opusPacketSamples(Uint8Array.of(0xf8))).toBe(960); // CELT 20 ms
    expect(opusPacketSamples(Uint8Array.of(0x08))).toBe(960); // SILK 20 ms
    expect(opusPacketSamples(Uint8Array.of(0x18))).toBe(2880); // SILK 60 ms
    expect(opusPacketSamples(Uint8Array.of(0x80))).toBe(120); // CELT 2.5 ms
    expect(opusPacketSamples(Uint8Array.of(0xf9))).toBe(1920); // two frames
    expect(opusPacketSamples(Uint8Array.of(0xfb, 0x03))).toBe(2880); // three, counted in the second byte
    expect(opusPacketSamples(new Uint8Array(0))).toBe(0);
  });

  it("reads the header and the packets, one longer than a segment put back together", () => {
    const long = packet(600, 7);
    const stream = readOggOpus(file([packet(40, 1), long, packet(30, 2)], 2000n));
    expect(stream).not.toBeNull();
    expect(stream!.channels).toBe(2);
    expect(stream!.preSkip).toBe(312);
    expect(stream!.packets.map((one) => one.length)).toEqual([40, 600, 30]);
    expect(stream!.packets[1]).toEqual(long);
    expect(stream!.endGranule).toBe(2000);
  });

  it("refuses what isn't Ogg Opus", () => {
    expect(readOggOpus(new TextEncoder().encode("RIFF....WAVEfmt "))).toBeNull();
    expect(oggOpusToWebm(page([new TextEncoder().encode("\x01vorbis-and-more-bytes")], 0n, 0))).toBeNull();
  });

  it("writes a WebM with the header, the start delay and every packet, the padding cut from the last", () => {
    const audio = [packet(40, 1), packet(50, 2), packet(60, 3)];
    // 3 x 960 samples, 312 of them the pre-skip, 2000 the last granule: 880 to drop at the end.
    const webm = oggOpusToWebm(file(audio, 2000n))!;
    expect([...webm.subarray(0, 4)]).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
    expect(find(webm, [...new TextEncoder().encode("webm")])).toBeGreaterThan(0);
    expect(find(webm, [...new TextEncoder().encode("A_OPUS")])).toBeGreaterThan(0);
    expect(find(webm, [...head])).toBeGreaterThan(0);
    // CodecDelay: 312 samples = 6 500 000 ns.
    expect(find(webm, [0x56, 0xaa, 0x83, 0x63, 0x2e, 0xa0])).toBeGreaterThan(0);
    // The first two as SimpleBlocks, the first 7 ms before 0 (-6.5, -7 = 0xfff9); the next at 14 ms (13.5).
    expect(find(webm, [0xa3, 0x80 | 44, 0x81, 0xff, 0xf9, 0x80, 0xf8, 1])).toBeGreaterThan(0);
    expect(find(webm, [0xa3, 0x80 | 54, 0x81, 0x00, 0x0e, 0x80, 0xf8, 2])).toBeGreaterThan(0);
    // The last in a BlockGroup, with DiscardPadding: 880 samples = 18 333 333 ns.
    expect(find(webm, [0xa1, 0x80 | 64, 0x81, 0x00, 0x22, 0x00, 0xf8, 3])).toBeGreaterThan(0);
    expect(find(webm, [0x75, 0xa2, 0x88, 0, 0, 0, 0, 0x01, 0x17, 0xbe, 0x95])).toBeGreaterThan(0);
  });

  it("no padding to drop: every packet a SimpleBlock", () => {
    const webm = oggOpusToWebm(file([packet(40, 1), packet(50, 2)], 1920n))!;
    expect(find(webm, [0xa3, 0x80 | 54, 0x81, 0x00, 0x0e, 0x80, 0xf8, 2])).toBeGreaterThan(0);
    expect(find(webm, [0x75, 0xa2])).toBe(-1);
  });

  it("starts a new cluster every five seconds, as a block's time in one is 16 bits", () => {
    const audio = Array.from({ length: 600 }, (_, i) => packet(20, i % 200)); // 12 s
    const webm = oggOpusToWebm(file(audio, BigInt(600 * 960)))!;
    let clusters = 0;
    for (let at = find(webm, [0x1f, 0x43, 0xb6, 0x75]); at >= 0; ) {
      clusters++;
      const next = find(webm.subarray(at + 4), [0x1f, 0x43, 0xb6, 0x75]);
      at = next < 0 ? -1 : at + 4 + next;
    }
    expect(clusters).toBe(3);
  });
});
