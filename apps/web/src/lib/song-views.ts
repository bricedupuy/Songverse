import { useEffect } from "react";
import { apiClient } from "#/lib/api-client";

/**
 * Notes that the user opened a song (issue #81): their Recently viewed on
 * the Library's home, and a view towards their teams' Popular. Offline or
 * failing, nothing happens - it's only a hint.
 */
export function useSongView(songVersionId: string | null | undefined): void {
  useEffect(() => {
    if (songVersionId) apiClient.recordSongView(songVersionId).catch(() => {});
  }, [songVersionId]);
}
