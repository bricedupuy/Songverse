import { ApiProperty } from "@nestjs/swagger";
import { DISPLAY_MODES, CAPO_DISPLAY_MODES, VOICING_PREFERENCES } from "@songverse/core";

export class UserResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ required: false, nullable: true }) avatarUrl!: string | null;
  @ApiProperty({ enum: DISPLAY_MODES }) displayMode!: (typeof DISPLAY_MODES)[number];
  @ApiProperty({ enum: CAPO_DISPLAY_MODES }) capoDisplayMode!: (typeof CAPO_DISPLAY_MODES)[number];
  @ApiProperty({ enum: VOICING_PREFERENCES }) voicingPreference!: (typeof VOICING_PREFERENCES)[number];
  @ApiProperty() isGlobalAdmin!: boolean;
}
