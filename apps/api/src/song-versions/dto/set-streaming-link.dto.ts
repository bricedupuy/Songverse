import { ApiProperty } from "@nestjs/swagger";
import { IsUrl, ValidateIf, IsString, MinLength } from "class-validator";

export class SetStreamingLinkDto {
  @ApiProperty({ description: "A share link (or, for Spotify/YouTube, a bare ID also works)" })
  @IsString()
  @MinLength(1)
  // A bare Spotify/YouTube ID isn't a URL, so this only enforces URL shape
  // when the value actually looks like one (contains "://").
  @ValidateIf((_, value: string) => typeof value === "string" && value.includes("://"))
  @IsUrl()
  url!: string;
}
