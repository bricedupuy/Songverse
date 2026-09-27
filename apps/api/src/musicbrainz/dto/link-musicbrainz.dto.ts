import { LinkMusicBrainzSchema } from "@songverse/core";
import { zodDto } from "../../common/zod-validation.js";

export class LinkMusicBrainzDto extends zodDto(LinkMusicBrainzSchema) {}
