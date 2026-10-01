import { describe, expect, it } from "vite-plus/test";
import { detailsWithAnalysis, type SourceDetails } from "./analysis.js";

const none: SourceDetails = { recordingKey: null, recordingTempo: null, recordingTimeSignature: null, recordingFirstBeat: null, cuePoints: null };
const song = {
  sections: [
    { id: "sec_v", type: "verse", label: null, showLabel: true, lines: [] },
    { id: "sec_c", type: "chorus", label: null, showLabel: true, lines: [] },
  ],
  flow: [
    { id: "fi_v", sectionId: "sec_v" },
    { id: "fi_c", sectionId: "sec_c" },
  ],
} as never;
const analysis = {
  tempo: { bpm: 72.06, confidence: 0.9 },
  first_beat: 0.4204,
  time_signature: { numerator: 4, denominator: 4, confidence: 0.8 },
  key: { name: "G", confidence: 0.7 },
  sections: [
    { start: 0, label: "start" },
    { start: 8.3, label: "verse" },
    { start: 40.1, label: "chorus" },
  ],
};

describe("detailsWithAnalysis", () => {
  it("fills in what the recording lacks, each marked detected", () => {
    expect(detailsWithAnalysis(none, analysis, song)).toEqual({
      recordingKey: "G",
      recordingTempo: 72.1,
      recordingTimeSignature: "4/4",
      recordingFirstBeat: 0.42,
      cuePoints: [
        { at: 8.3, sectionId: "sec_v" },
        { at: 40.1, sectionId: "sec_c" },
      ],
      detected: ["key", "tempo", "timeSignature", "firstBeat", "sections"],
    });
  });

  it("never replaces what the recording has", () => {
    const own = { ...none, recordingKey: "A", recordingTempo: 80, cuePoints: [{ at: 1, sectionId: "sec_v" }] };
    const result = detailsWithAnalysis(own, analysis, song);
    expect(result.recordingKey).toBe("A");
    expect(result.recordingTempo).toBe(80);
    expect(result.cuePoints).toEqual([{ at: 1, sectionId: "sec_v" }]);
    expect(result.detected).toEqual(["timeSignature", "firstBeat"]);
  });

  it("leaves out what it isn't sure of, or what doesn't read", () => {
    const result = detailsWithAnalysis(none, { key: { name: "G", confidence: 0.3 }, tempo: { bpm: 900 }, time_signature: { numerator: 4, denominator: 3 } }, song);
    expect(result).toEqual({ ...none, detected: [] });
    expect(detailsWithAnalysis(none, { key: { name: "Q#" } }, song).detected).toEqual([]);
  });

  it("without an analysis, the recording's as they are", () => {
    expect(detailsWithAnalysis(none, undefined, song)).toEqual({ ...none, detected: [] });
  });
});
