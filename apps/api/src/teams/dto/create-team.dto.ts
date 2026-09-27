import { CreateTeamSchema } from "@songverse/core";
import { zodDto } from "../../common/zod-validation.js";

export class CreateTeamDto extends zodDto(CreateTeamSchema) {}
