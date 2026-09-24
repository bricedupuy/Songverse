import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsBoolean, IsISO8601, IsObject, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from "class-validator";

const trim = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value);

export class CreateArrangementDto {
  @ApiProperty({ maxLength: 100 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiProperty({ required: false, nullable: true, type: String })
  @IsOptional()
  @Transform(trim)
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @ApiProperty({ required: false, description: "Owned by this team (its admins can change it); otherwise by you" })
  @IsOptional()
  @IsString()
  teamId?: string;

  @ApiProperty({ required: false, description: "Start as a copy of this arrangement of the same song" })
  @IsOptional()
  @IsString()
  copyFromId?: string;
}

export class UpdateArrangementDto {
  @ApiProperty({ required: false, maxLength: 100 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiProperty({ required: false, nullable: true, type: String })
  @IsOptional()
  @Transform(trim)
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @ApiProperty({ required: false, type: Object, description: "ArrangementDocument v2 (docs/arrangement-document-v2.md)" })
  @IsOptional()
  @IsObject()
  document?: Record<string, unknown>;

  @ApiProperty({ required: false, description: "The team's usual arrangement of the song (team arrangements only)" })
  @IsOptional()
  @IsBoolean()
  isTeamDefault?: boolean;

  @ApiProperty({
    required: false,
    description: "When the arrangement was last saved as the editor loaded it; a save is refused (409) if it changed since",
  })
  @IsOptional()
  @IsISO8601()
  updatedAt?: string;
}

export class ChartPreferencesDto {
  @ApiProperty()
  @IsString()
  songVersionId!: string;

  @ApiProperty({ required: false, nullable: true, type: String, description: "Null or left out: the song as written" })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  arrangementId?: string | null;

  @ApiProperty({ type: Object, description: "chart-preferences/v1" })
  @IsObject()
  preferences!: Record<string, unknown>;
}

export class SetChartPreferencesDto {
  @ApiProperty({ type: Object, description: "chart-preferences/v1" })
  @IsObject()
  preferences!: Record<string, unknown>;
}
