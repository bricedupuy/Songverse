import { ApiProperty } from "@nestjs/swagger";
import { DISPLAY_MODES, CAPO_DISPLAY_MODES, CHORD_NOTATIONS, INSTRUMENTS, VOICING_PREFERENCES, SUPPORTED_LOCALES, TECH_ROLES } from "@songverse/core";

export class UserResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ required: false, nullable: true }) avatarUrl!: string | null;
  @ApiProperty({ enum: SUPPORTED_LOCALES }) locale!: (typeof SUPPORTED_LOCALES)[number];
  @ApiProperty({ enum: DISPLAY_MODES }) displayMode!: (typeof DISPLAY_MODES)[number];
  @ApiProperty({ enum: CAPO_DISPLAY_MODES }) capoDisplayMode!: (typeof CAPO_DISPLAY_MODES)[number];
  @ApiProperty({ enum: CHORD_NOTATIONS }) chordNotation!: (typeof CHORD_NOTATIONS)[number];
  @ApiProperty({ enum: VOICING_PREFERENCES }) voicingPreference!: (typeof VOICING_PREFERENCES)[number];
  @ApiProperty() isGlobalAdmin!: boolean;
  @ApiProperty() isReviewer!: boolean;
  @ApiProperty({ enum: INSTRUMENTS, isArray: true }) instruments!: (typeof INSTRUMENTS)[number][];
  @ApiProperty({ enum: TECH_ROLES, isArray: true }) techRoles!: (typeof TECH_ROLES)[number][];
}
