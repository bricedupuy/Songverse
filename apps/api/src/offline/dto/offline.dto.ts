import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from "class-validator";

export const PIN_KINDS = ["SET", "SONG", "SONGBOOK"] as const;
export type PinKind = (typeof PIN_KINDS)[number];

export class KnownCopyDto {
  @ApiProperty()
  @IsString()
  @MaxLength(64)
  id!: string;

  @ApiProperty({ description: "The version of the copy the device has (from an earlier sync or offline download)" })
  @IsString()
  @MaxLength(64)
  version!: string;
}

export class OfflineSyncDto {
  @ApiProperty({ required: false, description: "How many days ahead count as upcoming (default 14)", minimum: 1, maximum: 60 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  days?: number;

  @ApiProperty({ required: false, type: [KnownCopyDto], description: "The sets the device keeps, with their versions" })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => KnownCopyDto)
  known?: KnownCopyDto[];

  @ApiProperty({ required: false, type: [KnownCopyDto], description: "The songs the device keeps, with their versions" })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => KnownCopyDto)
  knownSongs?: KnownCopyDto[];

  @ApiProperty({ required: false, type: [KnownCopyDto], description: "The songbooks the device keeps, with their versions" })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => KnownCopyDto)
  knownSongbooks?: KnownCopyDto[];
}

export class OfflinePinDto {
  @ApiProperty({ enum: PIN_KINDS })
  @IsIn(PIN_KINDS)
  kind!: PinKind;

  @ApiProperty()
  @IsString()
  @MaxLength(64)
  targetId!: string;

  @ApiProperty({ required: false, description: "Download its audio files too (off by default)" })
  @IsOptional()
  @IsBoolean()
  includeAudio?: boolean;
}

export class OfflineSongsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  ids!: string[];
}
