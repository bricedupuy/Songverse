import { CatalogEntryInputSchema } from "@songverse/core";
import { zodDto } from "../../common/zod-validation.js";

export class CatalogEntryInputDto extends zodDto(CatalogEntryInputSchema) {}
