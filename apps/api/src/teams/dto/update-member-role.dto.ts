import { UpdateMemberRoleSchema } from "@songverse/core";
import { zodDto } from "../../common/zod-validation.js";

export class UpdateMemberRoleDto extends zodDto(UpdateMemberRoleSchema) {}
