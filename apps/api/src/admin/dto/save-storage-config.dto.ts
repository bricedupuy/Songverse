import { SaveStorageConfigSchema } from "@songverse/core";
import { zodDto } from "../../common/zod-validation.js";

export class SaveStorageConfigDto extends zodDto(SaveStorageConfigSchema) {}
