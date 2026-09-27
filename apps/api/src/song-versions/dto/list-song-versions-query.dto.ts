import { ListSongVersionsQuerySchema } from "@songverse/core";
import { zodDto } from "../../common/zod-validation.js";

export { SONG_SORTS, type SongSort } from "@songverse/core";

/** GET /song-versions: one page of the songs you can see, optionally searched and filtered. */
export class ListSongVersionsQueryDto extends zodDto(ListSongVersionsQuerySchema) {}
