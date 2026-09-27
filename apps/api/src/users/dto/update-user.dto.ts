import { UpdateUserSchema } from "@songverse/core";
import { zodDto } from "../../common/zod-validation.js";

export class UpdateUserDto extends zodDto(UpdateUserSchema) {}
