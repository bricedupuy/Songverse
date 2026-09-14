import { ApiProperty } from "@nestjs/swagger";

export class TagCategoryResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() label!: string;
  @ApiProperty() isGlobal!: boolean;
}

export class TagResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() categoryId!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() label!: string;
  @ApiProperty() scope!: string;
  @ApiProperty() isApproved!: boolean;
}
