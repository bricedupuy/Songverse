import { UpdateCatalogSchema } from "@songverse/core";
import { zodDto } from "../../common/zod-validation.js";

export class UpdateCatalogDto extends zodDto(UpdateCatalogSchema) {}
