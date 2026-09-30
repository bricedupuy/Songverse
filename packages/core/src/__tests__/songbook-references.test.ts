import { describe, expect, it } from "vite-plus/test";
import { compareEntryCodes, normalizeEntryCode } from "../songbook-catalog-format/index.js";
import { entryCodeMatches, formatSongbookReference, songbookMatches, songbookReferences } from "../songbook-references/index.js";

describe("songbookReferences", () => {
  it("reads a book and a number", () => {
    expect(songbookReferences("HY 42")).toEqual([{ book: "HY", code: "42" }]);
    expect(songbookReferences("  Hymns   42 ")).toEqual([{ book: "Hymns", code: "42" }]);
    expect(songbookReferences("Hymns #42")).toEqual([{ book: "Hymns", code: "42" }]);
    expect(songbookReferences("Chants de victoire, 245")).toEqual([{ book: "Chants de victoire", code: "245" }]);
    expect(songbookReferences("HY A-17")).toEqual([{ book: "HY", code: "A-17" }]);
  });

  it("a number alone is in any songbook; run together, the letters may be the book", () => {
    expect(songbookReferences("42")).toEqual([{ book: null, code: "42" }]);
    expect(songbookReferences("A-17")).toEqual([{ book: null, code: "A-17" }]);
    expect(songbookReferences("HY42")).toEqual([
      { book: "HY", code: "42" },
      { book: null, code: "HY42" },
    ]);
  });

  it("nothing without a number", () => {
    expect(songbookReferences("Amazing grace")).toEqual([]);
    expect(songbookReferences("")).toEqual([]);
  });
});

describe("matching", () => {
  const hymns = { name: "Hymns of Faith", abbreviation: "HY" };
  it("a book by its abbreviation, or part of its name, ignoring case and accents", () => {
    expect(songbookMatches(hymns, "hy")).toBe(true);
    expect(songbookMatches(hymns, "faith")).toBe(true);
    expect(songbookMatches({ name: "Chants d'Espérance", abbreviation: null }, "esperance")).toBe(true);
    expect(songbookMatches(hymns, "H")).toBe(false);
    expect(songbookMatches(hymns, null)).toBe(true);
  });

  it("an entry by its code, ignoring case", () => {
    expect(entryCodeMatches("A-17", "a-17")).toBe(true);
    expect(entryCodeMatches("42", "420")).toBe(false);
    expect(entryCodeMatches("042", "42")).toBe(true);
    expect(entryCodeMatches("42", "0042")).toBe(true);
    expect(entryCodeMatches(null, "42")).toBe(false);
  });
});

describe("entry numbers (issue #55)", () => {
  it("plain numbers lose their leading zeros; codes stay as printed", () => {
    expect(normalizeEntryCode("0245")).toBe("245");
    expect(normalizeEntryCode(" 007 ")).toBe("7");
    expect(normalizeEntryCode("000")).toBe("0");
    expect(normalizeEntryCode("FR-092")).toBe("FR-092");
    expect(normalizeEntryCode("12a")).toBe("12a");
  });

  it("sort in reading order", () => {
    expect(["100", "2", "10", "A-10", "1", "A-2", "12a", "12"].sort(compareEntryCodes)).toEqual(["1", "2", "10", "12", "12a", "100", "A-2", "A-10"]);
  });
});

describe("formatSongbookReference", () => {
  it("abbreviation and number, with the printed volume", () => {
    expect(formatSongbookReference({ songbookName: "J'aime l'Éternel", abbreviation: "JEM", entryCode: "855", sectionLabel: "JEM3" })).toBe("JEM 855 · JEM3");
    expect(formatSongbookReference({ songbookName: "J'aime l'Éternel", abbreviation: "JEM", entryCode: "855", sectionLabel: null })).toBe("JEM 855");
  });
  it("the name without an abbreviation; just the name without a number", () => {
    expect(formatSongbookReference({ songbookName: "Hymns", abbreviation: null, entryCode: "42" })).toBe("Hymns 42");
    expect(formatSongbookReference({ songbookName: "Sunday favourites", abbreviation: null, entryCode: null })).toBe("Sunday favourites");
  });
});
