import { ApiProperty } from "@nestjs/swagger";
import { IsUUID } from "class-validator";

export class LinkMusicBrainzDto {
  @ApiProperty({ description: "MusicBrainz MBID (UUID) of the recording or work to link" })
  @IsUUID()
  mbid!: string;
}
