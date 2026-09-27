import { describe, expect, it } from "vitest";
import { CreateSongVersionSchema, ListSongVersionsQuerySchema, UpdateSongVersionSchema, UploadAttachmentSchema } from "../requests/index.js";

describe("request schemas (issue #118)", () => {
  it("left out or null: left alone; for a field that can be cleared, null or blank clears it", () => {
    const parsed = UpdateSongVersionSchema.parse({ title: null, album: "  ", key: null, ccli: " 123 " });
    expect(parsed).toEqual({ title: undefined, album: null, key: null, ccli: "123" });
    expect("versionName" in parsed).toBe(false);
  });

  it("trims names, drops blanks, then counts them", () => {
    expect(UpdateSongVersionSchema.parse({ composers: [" A ", "", "B"] }).composers).toEqual(["A", "B"]);
    const noArtist = CreateSongVersionSchema.safeParse({ title: "T", language: "en", artists: ["  "] });
    expect(noArtist.success ? [] : noArtist.error.issues.map((issue) => issue.message)).toEqual(["A song needs at least one artist"]);
  });

  it("normalizes an ISRC before checking it", () => {
    expect(UpdateSongVersionSchema.parse({ isrc: "us-rc1 7607839" }).isrc).toBe("USRC17607839");
    expect(UpdateSongVersionSchema.parse({ isrc: "" }).isrc).toBeNull();
    expect(UpdateSongVersionSchema.safeParse({ isrc: "ABC" }).success).toBe(false);
  });

  it("refuses a field it doesn't know", () => {
    expect(UpdateSongVersionSchema.safeParse({ colour: "red" }).success).toBe(false);
  });

  it("reads a query's numbers and yes/no", () => {
    expect(ListSongVersionsQuerySchema.parse({ page: "2", favorites: "true", q: " grace " })).toEqual({ page: 2, favorites: true, q: "grace" });
    expect(ListSongVersionsQuerySchema.safeParse({ pageSize: "500" }).success).toBe(false);
  });

  it("an empty form field is left out", () => {
    expect(UploadAttachmentSchema.parse({ type: "AUDIO", stemPart: "", teamId: "" })).toEqual({ type: "AUDIO", stemPart: undefined, teamId: undefined });
  });
});
