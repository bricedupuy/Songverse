import { AddSongbookEntrySchema } from "@songverse/core";
import { zodDto } from "../../common/zod-validation.js";

export class AddSongbookEntryDto extends zodDto(AddSongbookEntrySchema) {}
