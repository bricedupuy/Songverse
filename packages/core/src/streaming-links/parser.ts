export type StreamingIdentifierType = "SPOTIFY" | "APPLE_MUSIC" | "YOUTUBE";

export interface ParsedStreamingLink {
  /** The clean ID stored as the identifier's value, where one can be extracted. */
  value: string;
  /** Always a usable link back to the track/video, whether reconstructed from the ID or the original URL. */
  sourceUrl: string;
}

function tryParseUrl(input: string): URL | null {
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

/**
 * Extracts a clean track/video ID from a pasted streaming link, so the
 * stored `value` is a real identifier rather than an arbitrary URL (with
 * tracking query params, regional path segments, etc.) - matching how
 * MusicBrainz identifiers are stored. Falls back to storing the raw input
 * verbatim if the shape isn't recognized, rather than rejecting it: a
 * field for "paste a link" shouldn't refuse a link it doesn't recognize.
 */
export function parseStreamingLink(type: StreamingIdentifierType, input: string): ParsedStreamingLink {
  const trimmed = input.trim();
  const url = tryParseUrl(trimmed);

  if (type === "SPOTIFY") {
    const id = url?.pathname.match(/\/track\/([A-Za-z0-9]+)/)?.[1] ?? (!url ? trimmed : null);
    if (id) return { value: id, sourceUrl: `https://open.spotify.com/track/${id}` };
  }

  if (type === "YOUTUBE") {
    const id =
      url?.searchParams.get("v") ??
      (url?.hostname.replace(/^www\./, "") === "youtu.be" ? url.pathname.slice(1) : null) ??
      (!url ? trimmed : null);
    if (id) return { value: id, sourceUrl: `https://www.youtube.com/watch?v=${id}` };
  }

  if (type === "APPLE_MUSIC") {
    // Apple Music URLs carry a region and slug that can't be reconstructed
    // from the ID alone, so the original URL (not a rebuilt one) is what
    // gets stored as sourceUrl here.
    const id = url?.searchParams.get("i") ?? url?.pathname.match(/(\d+)\/?$/)?.[1] ?? (!url ? trimmed : null);
    if (id) return { value: id, sourceUrl: url?.toString() ?? trimmed };
  }

  return { value: trimmed, sourceUrl: url ? url.toString() : trimmed };
}
