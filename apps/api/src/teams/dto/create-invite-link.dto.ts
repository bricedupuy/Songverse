import { ApiProperty } from "@nestjs/swagger";
import { TEAM_ROLES, type TeamRoleValue } from "@songverse/core";
import { IsIn, IsInt, IsOptional, Max, Min } from "class-validator";

export class CreateInviteLinkDto {
  @ApiProperty({ enum: TEAM_ROLES, required: false, description: "Role granted on join; defaults to MEMBER" })
  @IsOptional()
  @IsIn(TEAM_ROLES)
  role?: TeamRoleValue;

  @ApiProperty({ required: false, description: "Days until the link expires; omit for no expiry" })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  expiresInDays?: number;

  @ApiProperty({ required: false, description: "Maximum number of times the link can be used; omit for unlimited" })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number;
}
