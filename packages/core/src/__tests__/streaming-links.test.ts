import { describe, expect, it } from "vite-plus/test";
import { parseStreamingLink } from "../streaming-links/parser.js";

describe("parseStreamingLink", () => {
  it("extracts a Spotify track ID from a full URL, ignoring tracking params", () => {
    const result = parseStreamingLink("SPOTIFY", "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=abc123");
    expect(result).toEqual({
      value: "4uLU6hMCjMI75M1A2tKUQC",
      sourceUrl: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
    });
  });

  it("accepts a bare Spotify ID with no URL", () => {
    const result = parseStreamingLink("SPOTIFY", "4uLU6hMCjMI75M1A2tKUQC");
    expect(result.value).toBe("4uLU6hMCjMI75M1A2tKUQC");
    expect(result.sourceUrl).toBe("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC");
  });

  it("extracts a YouTube video ID from a watch URL", () => {
    const result = parseStreamingLink("YOUTUBE", "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=xyz");
    expect(result).toEqual({ value: "dQw4w9WgXcQ", sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
  });

  it("extracts a YouTube video ID from a youtu.be short URL", () => {
    const result = parseStreamingLink("YOUTUBE", "https://youtu.be/dQw4w9WgXcQ");
    expect(result).toEqual({ value: "dQw4w9WgXcQ", sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
  });

  it("extracts an Apple Music track ID from the ?i= query param, keeping the original URL", () => {
    const url = "https://music.apple.com/us/album/amazing-grace/1440857781?i=1440857782";
    const result = parseStreamingLink("APPLE_MUSIC", url);
    expect(result).toEqual({ value: "1440857782", sourceUrl: url });
  });

  it("extracts a Deezer track ID, with or without a language in the path", () => {
    expect(parseStreamingLink("DEEZER", "https://www.deezer.com/fr/track/3135556?utm=x")).toEqual({ value: "3135556", sourceUrl: "https://www.deezer.com/track/3135556" });
    expect(parseStreamingLink("DEEZER", "3135556").sourceUrl).toBe("https://www.deezer.com/track/3135556");
  });

  it("falls back to storing the raw input when the shape isn't recognized", () => {
    const result = parseStreamingLink("SPOTIFY", "https://example.com/whatever");
    expect(result.value).toBe("https://example.com/whatever");
    expect(result.sourceUrl).toBe("https://example.com/whatever");
  });
});
