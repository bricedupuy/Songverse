import "../zod-config.js";
import { z } from "zod";
import { optional, requiredText } from "./fields.js";
import { SONG_SORTS, UpdateSongVersionSchema } from "./songs.js";

/** What a smart list filters the library by (the library's own search parameters). */
const smartListFilters = z.strictObject({
  q: optional(z.string().max(200)),
  language: optional(z.string().max(10)),
  tagId: optional(z.string().max(64)),
  artist: optional(z.string().max(200)),
  sort: optional(z.enum(SONG_SORTS)),
  dir: optional(z.enum(["asc", "desc"])),
});

export const CreateSmartListSchema = z.strictObject({
  name: requiredText(80),
  filters: smartListFilters,
});

/** What's left out stays as it is. */
export const UpdateSmartListSchema = z.strictObject({
  name: optional(requiredText(80)),
  filters: optional(smartListFilters),
});

/** A suggested change: what the song editor would save, and a word for the reviewer. Tags aren't part of it. */
export const CreateSuggestionSchema = UpdateSongVersionSchema.extend({
  message: optional(z.string().max(2000)),
});

export const ReviewSuggestionSchema = z.strictObject({ notes: optional(z.string().max(2000)) });

export const ListSuggestionsQuerySchema = z.strictObject({ state: optional(z.enum(["open", "closed"])) });

export const SearchRecordingsQuerySchema = z.strictObject({
  title: z.string().min(1),
  artist: optional(z.string()),
});

export const SearchWorksQuerySchema = z.strictObject({ title: z.string().min(1) });
