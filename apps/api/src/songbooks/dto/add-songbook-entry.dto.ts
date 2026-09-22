import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";

export class AddSongbookEntryDto {
  @ApiProperty()
  @IsString()
  songVersionId!: string;

  @ApiProperty({ description: 'The number/code this song has in the book, e.g. "245", "A-17"' })
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  entryCode!: string;
}
