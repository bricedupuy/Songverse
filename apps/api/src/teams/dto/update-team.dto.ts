import { UpdateTeamSchema } from "@songverse/core";
import { zodDto } from "../../common/zod-validation.js";

export class UpdateTeamDto extends zodDto(UpdateTeamSchema) {}
