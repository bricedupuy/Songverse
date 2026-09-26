import { z } from "zod";

/**
 * Metadata providers (issue #22): where Auto detect looks a song up. Each
 * answers in the same shape; the same release found by several is one
 * match, listing them all as its sources.
 */
export const METADATA_PROVIDERS = ["musicbrainz", "apple_music", "deezer"] as const;
export type MetadataProviderKey = (typeof METADATA_PROVIDERS)[number];

export const METADATA_PROVIDER_NAMES: Record<MetadataProviderKey, string> = {
  musicbrainz: "MusicBrainz",
  apple_music: "Apple Music",
  deezer: "Deezer",
};

export const MetadataSourceSchema = z.object({
  provider: z.enum(METADATA_PROVIDERS),
  /** The provider's own ID: a MusicBrainz recording MBID, an Apple Music or Deezer track ID. */
  id: z.string().min(1).max(100),
  url: z.string().url(),
});
export type MetadataSource = z.infer<typeof MetadataSourceSchema>;

export const MetadataMatchSchema = z.object({
  title: z.string(),
  artist: z.string().nullable(),
  /** The album or single it came out on. */
  album: z.string().nullable(),
  /** ISO date, possibly year-only ("1998") or year-month. */
  releaseDate: z.string().nullable(),
  /** The release's artwork, full size (Apple Music or Deezer). */
  artworkUrl: z.string().url().nullable(),
  /** A small one, to show among the results. */
  thumbnailUrl: z.string().url().nullable(),
  /** The recording's ISRC, where the provider has it (the Apple Music API, issue #87). */
  isrc: z.string().nullable().optional(),
  /** Who wrote it, where the provider says (the Apple Music API's composers, issue #87). */
  composers: z.array(z.string()).optional(),
  sources: z.array(MetadataSourceSchema).min(1),
});
export type MetadataMatch = z.infer<typeof MetadataMatchSchema>;

export const LinkMetadataSchema = z.object({
  sources: z.array(MetadataSourceSchema.pick({ provider: true, id: true })).min(1).max(METADATA_PROVIDERS.length),
});
export type LinkMetadata = z.infer<typeof LinkMetadataSchema>;
