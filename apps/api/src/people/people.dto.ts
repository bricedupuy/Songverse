import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength } from "class-validator";

/** Ask someone to connect: by their email, or (someone from your teams) their user id. */
export class ConnectionRequestDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @ApiProperty({ required: false, description: "Someone you share a team with." })
  @IsOptional()
  @IsString()
  userId?: string;
}

export class ShareDto {
  @ApiProperty({ description: "Can edit its chart, details and credits, or only view it." })
  @IsBoolean()
  canEdit!: boolean;
}
