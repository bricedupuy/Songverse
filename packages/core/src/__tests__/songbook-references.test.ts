import { describe, expect, it } from "vitest";
import { entryCodeMatches, songbookMatches, songbookReferences } from "../songbook-references/index.js";

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
    expect(entryCodeMatches(null, "42")).toBe(false);
  });
});
