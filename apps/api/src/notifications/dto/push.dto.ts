import { CreatePushSubscriptionSchema } from "@songverse/core";
import { zodDto } from "../../common/zod-validation.js";

export class CreatePushSubscriptionDto extends zodDto(CreatePushSubscriptionSchema) {}
