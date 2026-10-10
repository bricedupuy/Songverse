import { MarkNotificationsReadSchema, NotificationsQuerySchema } from "@songverse/core";
import { zodDto } from "../../common/zod-validation.js";

export class NotificationsQueryDto extends zodDto(NotificationsQuerySchema) {}
export class MarkNotificationsReadDto extends zodDto(MarkNotificationsReadSchema) {}
