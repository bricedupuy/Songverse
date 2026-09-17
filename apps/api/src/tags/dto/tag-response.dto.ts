import { ApiProperty } from "@nestjs/swagger";

export class TagCategoryResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() label!: string;
  @ApiProperty({ required: false, nullable: true, description: "e.g. { fr: \"Thème\" }" }) translations!: unknown;
  @ApiProperty() isGlobal!: boolean;
}

export class TagResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() categoryId!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() label!: string;
  @ApiProperty({ required: false, nullable: true, description: "e.g. { fr: \"Pâques\" }" }) translations!: unknown;
  @ApiProperty() scope!: string;
  @ApiProperty() isApproved!: boolean;
}
