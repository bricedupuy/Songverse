import { ApiProperty } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { IsIn, IsObject, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from "class-validator";
import { SONG_SORTS, type SongSort } from "../song-versions/dto/list-song-versions-query.dto.js";

const trim = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value);

/** What a smart list filters the library by (the library's own search parameters). */
export class SmartListFiltersDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(200) q?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(10) language?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(64) tagId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(200) artist?: string;
  @ApiProperty({ required: false, enum: SONG_SORTS }) @IsOptional() @IsIn(SONG_SORTS) sort?: SongSort;
  @ApiProperty({ required: false, enum: ["asc", "desc"] }) @IsOptional() @IsIn(["asc", "desc"]) dir?: "asc" | "desc";
}

export class CreateSmartListDto {
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(80) name!: string;

  @ApiProperty({ type: SmartListFiltersDto })
  @IsObject()
  @ValidateNested()
  @Type(() => SmartListFiltersDto)
  filters!: SmartListFiltersDto;
}

/** What's left out stays as it is. */
export class UpdateSmartListDto {
  @ApiProperty({ required: false }) @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(80) name?: string;

  @ApiProperty({ required: false, type: SmartListFiltersDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => SmartListFiltersDto)
  filters?: SmartListFiltersDto;
}
