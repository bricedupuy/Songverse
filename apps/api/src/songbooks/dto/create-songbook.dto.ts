import { CreateSongbookSchema } from "@songverse/core";
import { zodDto } from "../../common/zod-validation.js";

export class CreateSongbookDto extends zodDto(CreateSongbookSchema) {}
