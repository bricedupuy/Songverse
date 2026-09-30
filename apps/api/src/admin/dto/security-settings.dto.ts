import { SaveSecuritySettingsSchema } from "@songverse/core";
import { zodDto } from "../../common/zod-validation.js";

export class SaveSecuritySettingsDto extends zodDto(SaveSecuritySettingsSchema) {}
