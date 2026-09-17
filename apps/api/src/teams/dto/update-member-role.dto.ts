import { ApiProperty } from "@nestjs/swagger";
import { TEAM_ROLES, type TeamRoleValue } from "@songverse/core";
import { IsIn } from "class-validator";

export class UpdateMemberRoleDto {
  @ApiProperty({ enum: TEAM_ROLES })
  @IsIn(TEAM_ROLES)
  role!: TeamRoleValue;
}
