import { ApiProperty } from "@nestjs/swagger";
import { IsString, MinLength } from "class-validator";

export class ImportChordProDto {
  @ApiProperty({ description: "Raw ChordPro (or ChordPro-ish) text to replace this version's content with" })
  @IsString()
  @MinLength(1)
  content!: string;
}
