import { SongbookEntrySearchQuerySchema } from "@songverse/core";
import { zodDto } from "../../common/zod-validation.js";

export class SongbookEntrySearchQueryDto extends zodDto(SongbookEntrySearchQuerySchema) {}
