import { cuesFromSections, parseKey, type CuePoint, type DetectedDetail, type SongDocumentV2 } from "@songverse/core";
import type { DemucsAnalysis } from "./demucs-client.js";

/** Below this, what the analysis says is left out (issue #175). */
export const MIN_CONFIDENCE = 0.5;

/** The recording details a separation's stems start with: the recording's own, else the analysis's. */
export interface SourceDetails {
  recordingKey: string | null;
  recordingTempo: number | null;
  recordingTimeSignature: string | null;
  recordingFirstBeat: number | null;
  cuePoints: CuePoint[] | null;
}

const sure = (confidence: number | undefined) => confidence === undefined || confidence >= MIN_CONFIDENCE;

/**
 * The stems' details (issue #175): each the recording's where it has one -
 * never replaced by a guess - else what the analysis found, if it's sure
 * enough and reads as one; those listed in `detected` until confirmed.
 * Sections are placed on the song's own (cuesFromSections).
 */
export function detailsWithAnalysis(source: SourceDetails, analysis: DemucsAnalysis | null | undefined, song: Pick<SongDocumentV2, "sections" | "flow"> | null): SourceDetails & { detected: DetectedDetail[] } {
  const details = { ...source };
  const detected: DetectedDetail[] = [];
  if (!analysis) return { ...details, detected };

  const key = analysis.key?.name?.trim();
  if (details.recordingKey === null && key && sure(analysis.key?.confidence) && parseKey(key)) {
    details.recordingKey = key;
    detected.push("key");
  }
  const bpm = analysis.tempo?.bpm;
  if (details.recordingTempo === null && typeof bpm === "number" && bpm >= 20 && bpm <= 400 && sure(analysis.tempo?.confidence)) {
    details.recordingTempo = Math.round(bpm * 10) / 10;
    detected.push("tempo");
  }
  const meter = analysis.time_signature;
  if (
    details.recordingTimeSignature === null &&
    meter &&
    Number.isInteger(meter.numerator) &&
    meter.numerator! >= 1 &&
    meter.numerator! <= 16 &&
    [2, 4, 8, 16].includes(meter.denominator ?? 0) &&
    sure(meter.confidence)
  ) {
    details.recordingTimeSignature = `${meter.numerator}/${meter.denominator}`;
    detected.push("timeSignature");
  }
  const first = analysis.first_beat;
  if (details.recordingFirstBeat === null && typeof first === "number" && first >= 0 && first <= 600) {
    details.recordingFirstBeat = Math.round(first * 1000) / 1000;
    detected.push("firstBeat");
  }
  if (!details.cuePoints?.length && song && analysis.sections?.length) {
    const found = analysis.sections.flatMap((section) => (typeof section.start === "number" && typeof section.label === "string" ? [{ start: section.start, label: section.label }] : []));
    const cues = cuesFromSections(found, song);
    if (cues.length > 0) {
      details.cuePoints = cues;
      detected.push("sections");
    }
  }
  return { ...details, detected };
}
