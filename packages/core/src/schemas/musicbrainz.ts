import { z } from "zod";

/**
 * A candidate match from MusicBrainz's `recording` entity — a specific
 * performance/track, which is what carries artist and album (release)
 * data. This is what a Song Version links to (SongIdentifierType
 * MUSICBRAINZ_RECORDING).
 */
export const MusicBrainzRecordingMatchSchema = z.object({
  mbid: z.string().uuid(),
  title: z.string(),
  artist: z.string().nullable(),
  releaseTitle: z.string().nullable(), // the album/release this recording appears on
  releaseDate: z.string().nullable(), // ISO date string, as returned by MusicBrainz (may be year-only)
  score: z.number().int().min(0).max(100), // MusicBrainz search relevance score
  sourceUrl: z.string().url(),
});
export type MusicBrainzRecordingMatch = z.infer<typeof MusicBrainzRecordingMatchSchema>;

/**
 * A candidate match from MusicBrainz's `work` entity — the abstract
 * composition (no artist/album; that lives on recordings). This is what
 * a Work links to (SongIdentifierType MUSICBRAINZ_WORK).
 */
export const MusicBrainzWorkMatchSchema = z.object({
  mbid: z.string().uuid(),
  title: z.string(),
  iswc: z.string().nullable(),
  language: z.string().nullable(),
  score: z.number().int().min(0).max(100),
  sourceUrl: z.string().url(),
});
export type MusicBrainzWorkMatch = z.infer<typeof MusicBrainzWorkMatchSchema>;

export const LinkMusicBrainzSchema = z.object({
  mbid: z.string().uuid(),
});
export type LinkMusicBrainz = z.infer<typeof LinkMusicBrainzSchema>;
