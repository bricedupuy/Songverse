import { ApiProperty } from "@nestjs/swagger";
import { INSTRUMENTS, TEAM_ROLES, TECH_ROLES } from "@songverse/core";

export class TeamMemberResponseDto {
  @ApiProperty() userId!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ required: false, nullable: true }) avatarUrl!: string | null;
  @ApiProperty({ enum: TEAM_ROLES }) role!: (typeof TEAM_ROLES)[number];
  @ApiProperty() joinedAt!: Date;
  @ApiProperty({ enum: INSTRUMENTS, isArray: true }) instruments!: (typeof INSTRUMENTS)[number][];
  @ApiProperty({ enum: TECH_ROLES, isArray: true }) techRoles!: (typeof TECH_ROLES)[number][];
}
