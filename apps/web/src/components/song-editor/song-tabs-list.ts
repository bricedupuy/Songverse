// The song screen's tabs and notices, apart from the editor itself: the
// route's search parser needs them on every page, and importing the editor
// for them would put the whole editor (Tiptap included) in the main bundle.

export const SONG_TABS = ["info", "editor", "arrangements", "files", "audio", "links"] as const;
export type SongTab = (typeof SONG_TABS)[number];

/** Problems left after creating a song, shown once it opens. */
export type SongNotice = "linkFailed" | "fileFailed";
