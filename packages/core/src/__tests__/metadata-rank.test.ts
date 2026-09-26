import { describe, expect, it } from "vitest";
import { foldForMatch, matchTier, rankMetadataMatches, type ProviderMatch } from "../metadata/rank.js";

const found = (provider: ProviderMatch["source"]["provider"], id: string, details: Partial<ProviderMatch>): ProviderMatch => ({
  title: "Oceans",
  artist: "Hillsong United",
  album: null,
  releaseDate: null,
  artworkUrl: null,
  thumbnailUrl: null,
  ...details,
  source: { provider, id, url: `https://example.com/${provider}/${id}` },
});

describe("foldForMatch", () => {
  it("ignores case, accents, asides and single/remaster suffixes", () => {
    expect(foldForMatch("Oceans (Where Feet May Fail)")).toBe("oceans");
    expect(foldForMatch("Écoute - Single")).toBe("ecoute");
    expect(foldForMatch("Zion - Remastered 2011")).toBe("zion");
  });
});

describe("matchTier", () => {
  it("prefers the title and artist, then the title alone, then part of it", () => {
    expect(matchTier({ title: "Oceans", artist: "Hillsong UNITED" }, "oceans", "Hillsong United")).toBe(4);
    expect(matchTier({ title: "Oceans", artist: "Hillsong United & Taya" }, "Oceans", "Taya")).toBe(4);
    expect(matchTier({ title: "Oceans", artist: "Someone" }, "Oceans", null)).toBe(3);
    expect(matchTier({ title: "Oceans", artist: "Someone" }, "Oceans", "Hillsong United")).toBe(2);
    expect(matchTier({ title: "Oceans Deep", artist: "Hillsong United" }, "Oceans", "Hillsong United")).toBe(1);
    expect(matchTier({ title: "Rivers", artist: "Hillsong United" }, "Oceans", "Hillsong United")).toBe(0);
  });
});

describe("rankMetadataMatches", () => {
  it("puts the first release first, not a later compilation", () => {
    const ranked = rankMetadataMatches(
      {
        musicbrainz: [
          found("musicbrainz", "b", { album: "Best of Worship", releaseDate: "2016-03-01" }),
          found("musicbrainz", "a", { album: "Zion", releaseDate: "2013-02-22" }),
        ],
      },
      ["musicbrainz"],
      "Oceans",
      "Hillsong United",
    );
    expect(ranked.map((match) => match.album)).toEqual(["Zion", "Best of Worship"]);
  });

  it("puts a close match before an older loose one, and the song before its karaoke", () => {
    const ranked = rankMetadataMatches(
      {
        apple_music: [
          found("apple_music", "1", { title: "Oceans (Karaoke Version)", artist: "Hillsong United", releaseDate: "2012" }),
          found("apple_music", "2", { artist: "Other Band", releaseDate: "1990" }),
          found("apple_music", "3", { releaseDate: "2013" }),
        ],
      },
      ["apple_music"],
      "Oceans",
      "Hillsong United",
    );
    expect(ranked.map((match) => match.sources[0].id)).toEqual(["3", "1", "2"]);
  });

  it("merges the same release from several providers: the first provider's details, every source, the earliest date", () => {
    const ranked = rankMetadataMatches(
      {
        deezer: [found("deezer", "d", { album: "Zion", releaseDate: "2013-02-22", artworkUrl: "https://example.com/d.jpg" })],
        musicbrainz: [found("musicbrainz", "m", { title: "Oceans (Where Feet May Fail)", album: "Zion", releaseDate: "2013" })],
        apple_music: [found("apple_music", "a", { album: "Zion", releaseDate: "2013-02-22", isrc: "AUHS11300001", composers: ["Joel Houston", "Matt Crocker"] })],
      },
      ["musicbrainz", "apple_music", "deezer"],
      "Oceans",
      "Hillsong United",
    );
    expect(ranked).toHaveLength(1);
    expect(ranked[0]).toMatchObject({
      title: "Oceans (Where Feet May Fail)",
      releaseDate: "2013-02-22",
      artworkUrl: "https://example.com/d.jpg",
      isrc: "AUHS11300001",
      composers: ["Joel Houston", "Matt Crocker"],
      sources: [{ provider: "musicbrainz" }, { provider: "apple_music" }, { provider: "deezer" }],
    });
  });

  it("breaks a tie by the providers' order", () => {
    const ranked = rankMetadataMatches(
      { deezer: [found("deezer", "d", { album: "A", releaseDate: "2013" })], apple_music: [found("apple_music", "x", { album: "B", releaseDate: "2013" })] },
      ["apple_music", "deezer"],
      "Oceans",
      "Hillsong United",
    );
    expect(ranked.map((match) => match.sources[0].provider)).toEqual(["apple_music", "deezer"]);
  });
});
