import { SaveNotificationServerSettingsSchema } from "@songverse/core";
import { zodDto } from "../../common/zod-validation.js";

export class SaveNotificationServerSettingsDto extends zodDto(SaveNotificationServerSettingsSchema) {}
