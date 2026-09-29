import { describe, expect, it } from "vitest";
import { alignTake, clickTimes, encodeWav, multitracksOf, recordingPlan, roundTripFrom } from "../index.js";

describe("multitracks (issue #123)", () => {
  const file = (filename: string, stemPart: string | null, multitrackId: string | null, createdAt: string, multitrackName: string | null = null, type = "AUDIO") =>
    ({ type, filename, stemPart, multitrackId, multitrackName, createdAt }) as Parameters<typeof multitracksOf>[0][number];

  it("groups a song's parts: its original stems first, then the others as they were started; whole recordings and other files in none", () => {
    const groups = multitracksOf([
      file("b-vocals.wav", "VOCALS", "mtlater0001", "2026-03-01T00:00:00Z", "Acoustic"),
      file("drums.mp3", "DRUMS", null, "2026-01-01T00:00:00Z"),
      file("vocals.mp3", "VOCALS", null, "2026-01-01T00:00:00Z"),
      file("a-guitar.wav", "GUITAR", "mtearly0001", "2026-02-01T00:00:00Z"),
      file("b-drums.wav", "DRUMS", "mtlater0001", "2026-02-15T00:00:00Z"),
      file("whole-song.mp3", null, null, "2026-01-01T00:00:00Z"),
      file("chart.pdf", null, null, "2026-01-01T00:00:00Z", null, "PDF"),
    ]);
    expect(groups.map((group) => [group.id, group.name, group.files.map((f) => f.filename).join()])).toEqual([
      [null, null, "vocals.mp3,drums.mp3"],
      ["mtearly0001", null, "a-guitar.wav"],
      ["mtlater0001", "Acoustic", "b-vocals.wav,b-drums.wav"],
    ]);
  });
});

describe("recording a part (issue #123)", () => {
  it("a new multitrack starts with a bar of count-in; an existing one gets a bar before its first beat", () => {
    expect(recordingPlan({ tempo: 120, beatsPerBar: 4, firstBeat: null })).toEqual({ firstBeat: 2, lead: 0 });
    expect(recordingPlan({ tempo: 120, beatsPerBar: 4, firstBeat: 0.5 })).toEqual({ firstBeat: 0.5, lead: 1.5 });
    expect(recordingPlan({ tempo: 120, beatsPerBar: 3, firstBeat: 4 })).toEqual({ firstBeat: 4, lead: 0 });
  });

  it("clicks on every beat from the count-in, the first of each bar accented", () => {
    expect(clickTimes({ tempo: 120, beatsPerBar: 4, firstBeat: 0.5, from: -1.5, to: 2.5 })).toEqual([
      { at: -1.5, accent: true },
      { at: -1, accent: false },
      { at: -0.5, accent: false },
      { at: 0, accent: false },
      { at: 0.5, accent: true },
      { at: 1, accent: false },
      { at: 1.5, accent: false },
      { at: 2, accent: false },
      { at: 2.5, accent: true },
    ]);
  });

  it("a take lines up with the timeline: shifted by the round trip, silence before the first sample", () => {
    const captured = Float32Array.from({ length: 10 }, (_, i) => i + 1);
    // 10 samples a second; 0:00 played at 1.0 s, captured from 1.1 s, heard back 0.3 s later.
    expect([...alignTake(captured, { sampleRate: 10, capturedAt: 1.1, zeroAt: 1, delay: 0.3 })]).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
    expect([...alignTake(captured, { sampleRate: 10, capturedAt: 1.5, zeroAt: 1, delay: 0.3, length: 4 })]).toEqual([0, 0, 1, 2]);
  });

  it("a WAV file: header, then 16-bit samples", () => {
    const wav = encodeWav(Float32Array.from([0, 1, -1, 0.5]), 48000);
    const view = new DataView(wav.buffer);
    expect(String.fromCharCode(...wav.slice(0, 4), ...wav.slice(8, 12))).toBe("RIFFWAVE");
    expect([view.getUint32(24, true), view.getUint16(22, true), view.getUint32(40, true)]).toEqual([48000, 1, 8]);
    expect([0, 1, 2, 3].map((i) => view.getInt16(44 + i * 2, true))).toEqual([0, 32767, -32768, 16383]);
  });

  it("the round trip from clicks played and heard back; nothing when they weren't heard", () => {
    const sampleRate = 1000;
    const captured = new Float32Array(3000).map(() => (Math.random() - 0.5) * 0.004);
    const played = [0.5, 1.2, 2.0];
    // Each heard 87 ms after it was played, from a capture starting at 0.1 s.
    for (const at of played) for (let i = 0; i < 20; i++) captured[Math.round((at + 0.087 - 0.1) * sampleRate) + i] = 0.4 * (i % 2 ? -1 : 1);
    expect(roundTripFrom(captured, { sampleRate, capturedAt: 0.1, playedAt: played })).toBeCloseTo(0.087, 3);
    expect(roundTripFrom(new Float32Array(3000), { sampleRate, capturedAt: 0.1, playedAt: played })).toBeNull();
  });
});
