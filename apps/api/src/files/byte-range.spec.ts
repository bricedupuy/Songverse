import { describe, expect, it } from "vite-plus/test";
import { parseByteRange } from "./byte-range.js";

describe("parseByteRange", () => {
  it("reads a start and an end, both included", () => {
    expect(parseByteRange("bytes=0-99", 1000)).toEqual({ start: 0, end: 99 });
  });
  it("reads from a byte to the end, and the last n bytes", () => {
    expect(parseByteRange("bytes=900-", 1000)).toEqual({ start: 900, end: 999 });
    expect(parseByteRange("bytes=-100", 1000)).toEqual({ start: 900, end: 999 });
    expect(parseByteRange("bytes=-5000", 1000)).toEqual({ start: 0, end: 999 });
  });
  it("stops at the end of the file", () => {
    expect(parseByteRange("bytes=500-5000", 1000)).toEqual({ start: 500, end: 999 });
  });
  it("refuses a range starting past the end", () => {
    expect(parseByteRange("bytes=1000-", 1000)).toBe("unsatisfiable");
    expect(parseByteRange("bytes=-0", 1000)).toBe("unsatisfiable");
  });
  it("gives the whole file for no range, a malformed one or several", () => {
    expect(parseByteRange(undefined, 1000)).toBeNull();
    expect(parseByteRange("bytes=abc", 1000)).toBeNull();
    expect(parseByteRange("bytes=0-1,5-6", 1000)).toBeNull();
    expect(parseByteRange("bytes=50-10", 1000)).toBeNull();
    expect(parseByteRange("items=0-1", 1000)).toBeNull();
    expect(parseByteRange("bytes=0-1", 0)).toBeNull();
  });
});
