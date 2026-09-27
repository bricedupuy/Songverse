import { CreateSmartListSchema, UpdateSmartListSchema } from "@songverse/core";
import { zodDto } from "../common/zod-validation.js";

export class CreateSmartListDto extends zodDto(CreateSmartListSchema) {}

export class UpdateSmartListDto extends zodDto(UpdateSmartListSchema) {}
