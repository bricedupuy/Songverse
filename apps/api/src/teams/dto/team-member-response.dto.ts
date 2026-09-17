import { ApiProperty } from "@nestjs/swagger";
import { TEAM_ROLES } from "@songverse/core";

export class TeamMemberResponseDto {
  @ApiProperty() userId!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ enum: TEAM_ROLES }) role!: (typeof TEAM_ROLES)[number];
  @ApiProperty() joinedAt!: Date;
}
