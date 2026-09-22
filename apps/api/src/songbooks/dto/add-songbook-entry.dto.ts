import { ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class AddSongbookEntryDto {
  @ApiProperty()
  @IsString()
  songVersionId!: string;

  @ApiProperty({
    required: false,
    description:
      'The number/code this song has in the book, e.g. "245", "A-17". Required for NUMBERED songbooks, ignored for SIMPLE ones.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  entryCode?: string;
}
