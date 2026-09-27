import { UpdateSongbookSchema } from "@songverse/core";
import { zodDto } from "../../common/zod-validation.js";

export class UpdateSongbookDto extends zodDto(UpdateSongbookSchema) {}
