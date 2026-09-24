/** A song's artists as one line, or null when it has none. */
export function artistNames(artists: { userId: string | null; source: string | null }[]): string | null {
  if (artists.length === 0) return null;
  return artists.map((a) => a.source ?? a.userId ?? "Unknown artist").join(", ");
}
