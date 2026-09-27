import { CreateCatalogSchema } from "@songverse/core";
import { zodDto } from "../../common/zod-validation.js";

export class CreateCatalogDto extends zodDto(CreateCatalogSchema) {}
