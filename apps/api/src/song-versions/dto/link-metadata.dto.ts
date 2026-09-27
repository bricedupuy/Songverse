import { LinkMetadataSchema } from "@songverse/core";
import { zodDto } from "../../common/zod-validation.js";

/** A match chosen in Auto detect (issue #22): its sources, looked up again. */
export class LinkMetadataDto extends zodDto(LinkMetadataSchema) {}
