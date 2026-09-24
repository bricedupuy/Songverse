import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class SubmitSongDto {
  @ApiProperty({ required: false, description: "A note for the reviewer" })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;

  @ApiProperty({ required: false, description: "Required when similar songs are already in the global catalogue" })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  duplicateReason?: string;
}

export class PublishSongDto {
  @ApiProperty({ required: false, description: "Required when similar songs are already in the global catalogue" })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  duplicateReason?: string;

  @ApiProperty({ required: false, description: 'Shown on the global song, e.g. "Official publisher text"' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  trustLabel?: string;
}

export class ResubmitDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;
}

export class ApproveSubmissionDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiProperty({ required: false, description: 'Shown on the global song, e.g. "Official publisher text"' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  trustLabel?: string;
}

export class MergeSubmissionDto {
  @ApiProperty({ description: "The global song this one duplicates" })
  @IsString()
  @IsNotEmpty()
  targetId!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class ReviewNotesDto {
  @ApiProperty({ description: "What needs changing, or why it's rejected - shown to the submitter" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  notes!: string;
}

export class ListSubmissionsQueryDto {
  @ApiProperty({ required: false, enum: ["open", "closed"], default: "open" })
  @IsOptional()
  @IsIn(["open", "closed"])
  state?: "open" | "closed";
}
