import { describe, expect, it } from "vite-plus/test";
import { isSystemFile, matchFilenamesToEntryCodes } from "../index.js";

const codes = ["1", "2", "245", "12a"];

describe("bulk upload: files matched to songbook numbers", () => {
  it("matches by the first number in the name, zero-padded or not", () => {
    const [a, b, c] = matchFilenamesToEntryCodes(["jem001.chordpro", "JEM_0245.pdf", "intro.cho"], codes);
    expect([a!.entryCode, a!.status]).toEqual(["1", "MATCHED"]);
    expect([b!.entryCode, b!.status]).toEqual(["245", "MATCHED"]);
    expect(c!.status).toBe("UNMATCHED");
  });

  it("a conflict says which other file claimed the same number (issue #201)", () => {
    const [a, b] = matchFilenamesToEntryCodes(["jem001.chordpro", "jem001 copy.chordpro"], codes);
    expect(a).toMatchObject({ status: "DUPLICATE", conflictsWith: ["jem001 copy.chordpro"] });
    expect(b).toMatchObject({ status: "DUPLICATE", conflictsWith: ["jem001.chordpro"] });
  });

  it("macOS's ._ copies and other system files are left out, and make no conflict", () => {
    expect(isSystemFile("._jem001.chordpro")).toBe(true);
    expect(isSystemFile(".DS_Store")).toBe(true);
    expect(isSystemFile("Thumbs.db")).toBe(true);
    expect(isSystemFile("jem001.chordpro")).toBe(false);
    const [real, copy] = matchFilenamesToEntryCodes(["jem001.chordpro", "._jem001.chordpro"], codes);
    expect(real!.status).toBe("MATCHED");
    expect(copy).toMatchObject({ status: "IGNORED", ignoredBecause: "hidden", entryCode: null });
  });

  it("files of another kind than the one uploaded are left out: a PDF beside the ChordPro file isn't a conflict", () => {
    const [chart, pdf] = matchFilenamesToEntryCodes(["jem002.chordpro", "jem002.pdf"], codes, "CHORDPRO");
    expect(chart!.status).toBe("MATCHED");
    expect(pdf).toMatchObject({ status: "IGNORED", ignoredBecause: "type" });
    expect(matchFilenamesToEntryCodes(["jem002.CHO", "jem002.txt"], codes, "CHORDPRO").map((m) => m.status)).toEqual(["DUPLICATE", "DUPLICATE"]);
    expect(matchFilenamesToEntryCodes(["jem002.PDF"], codes, "PDF")[0]!.status).toBe("MATCHED");
  });
});
