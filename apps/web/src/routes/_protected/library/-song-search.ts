import { SONG_TABS, type SongNotice, type SongTab } from "#/components/song-editor/song-tabs-list";

export interface SongSearch {
  tab?: SongTab;
  /** Comma-separated SongNotice values, from creating the song. */
  notice?: string;
  /** Adding a song: the song it's a translation or adaptation of (issue #78). */
  linkTo?: string;
}

export function parseSongSearch(search: Record<string, unknown>): SongSearch {
  return {
    ...(typeof search.tab === "string" && (SONG_TABS as readonly string[]).includes(search.tab) && { tab: search.tab as SongTab }),
    ...(typeof search.notice === "string" && search.notice && { notice: search.notice }),
    ...(typeof search.linkTo === "string" && search.linkTo && { linkTo: search.linkTo }),
  };
}

const NOTICES: SongNotice[] = ["linkFailed", "fileFailed"];

export function parseNotices(notice: string | undefined): SongNotice[] {
  return (notice ?? "").split(",").filter((value): value is SongNotice => (NOTICES as string[]).includes(value));
}
