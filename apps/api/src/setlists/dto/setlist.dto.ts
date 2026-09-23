import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const trim = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value);

export class CreateSetlistDto {
  @ApiProperty({ required: false, description: "Omit to have the set shown by its date" })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiProperty({ required: false, example: "2026-10-04", description: "Date only; today or later" })
  @IsOptional()
  @Matches(DATE_ONLY, { message: "eventDate must be YYYY-MM-DD" })
  eventDate?: string;

  @ApiProperty({ required: false, description: "Team to own the set (you must be one of its admins). Omit for a personal set." })
  @IsOptional()
  @IsString()
  teamId?: string;
}

/** Omitted fields are left unchanged; null (or an empty name) clears. */
export class UpdateSetlistDto {
  @ApiProperty({ required: false, nullable: true, type: String })
  @IsOptional()
  @Transform(trim)
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(120)
  name?: string | null;

  @ApiProperty({ required: false, nullable: true, type: String, example: "2026-10-04" })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(DATE_ONLY, { message: "eventDate must be YYYY-MM-DD" })
  eventDate?: string | null;
}

export class AddSetlistItemDto {
  @ApiProperty()
  @IsString()
  songVersionId!: string;

  @ApiProperty({ required: false, description: "Semitones relative to the song's own key" })
  @IsOptional()
  @IsInt()
  @Min(-11)
  @Max(11)
  transposeSteps?: number;
}

export class UpdateSetlistItemDto {
  @ApiProperty({ required: false, description: "Another version of the same song" })
  @IsOptional()
  @IsString()
  songVersionId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(-11)
  @Max(11)
  transposeSteps?: number;

  @ApiProperty({ required: false, nullable: true, type: String })
  @IsOptional()
  @Transform(trim)
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

export class ReorderSetlistItemsDto {
  @ApiProperty({ type: [String], description: "Every item id of the set, in the new order" })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  itemIds!: string[];
}
