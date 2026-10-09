import { createContext, useContext } from "react";

/** What a section's menu can do with the song's order (issue #205): sing that section again, linked to it. */
export const SongOrderActions = createContext<{ singAgain: (sectionId: string) => void } | null>(null);

export function useSongOrderActions() {
  return useContext(SongOrderActions);
}
