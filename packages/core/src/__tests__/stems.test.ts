import { describe, expect, it } from "vitest";
import { isAudioFilename, stemPartFromFilename } from "../stems/index.js";

describe("stemPartFromFilename", () => {
  it.each([
    ["Morning Light - Vocals.opus", "VOCALS"],
    ["vocals.wav", "VOCALS"],
    ["Lead Vox.mp3", "VOCALS"],
    ["Voix.mp3", "VOCALS"],
    ["03 drums.mp3", "DRUMS"],
    ["Batterie.opus", "DRUMS"],
    ["Bass drum.mp3", "DRUMS"],
    ["Morning Light - Bass.mp3", "BASS"],
    ["basse.ogg", "BASS"],
    ["Lead Guitar.mp3", "GUITAR"],
    ["EGTR 2.mp3", "GUITAR"],
    ["piano.wav", "KEYS"],
    ["Synth Pad.mp3", "KEYS"],
    ["BV.mp3", "BACKING_VOCALS"],
    ["Chœurs.mp3", "BACKING_VOCALS"],
    ["Backing vocals.mp3", "BACKING_VOCALS"],
    ["Click.mp3", "CLICK"],
    ["Guide.mp3", "CLICK"],
    ["other.wav", "OTHER"],
    ["no_vocals.wav", "OTHER"],
    ["Autres.mp3", "OTHER"],
  ])("%s is %s", (name, part) => {
    expect(stemPartFromFilename(name)).toBe(part);
  });

  it("says nothing for a name without a part", () => {
    expect(stemPartFromFilename("track4.opus")).toBeNull();
    expect(stemPartFromFilename("Morning Light.mp3")).toBeNull();
    // Not a word on its own.
    expect(stemPartFromFilename("Bassoon solo.mp3")).toBeNull();
    expect(stemPartFromFilename("Monkey business.mp3")).toBeNull();
  });
});

describe("isAudioFilename", () => {
  it("knows MP3 and Opus files by their extension", () => {
    expect(isAudioFilename("a.MP3")).toBe(true);
    expect(isAudioFilename("a.opus")).toBe(true);
    expect(isAudioFilename("a.pdf")).toBe(false);
  });
});
