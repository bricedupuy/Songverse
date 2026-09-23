import { ApiProperty } from "@nestjs/swagger";
import { Allow } from "class-validator";

/**
 * An entry's fields, any subset. Values are checked by the shared catalogue
 * rules (validateCatalogEntryPatch in @songverse/core), the same ones file
 * imports use - not by per-field decorators here. null (or "") clears a
 * field; a field left out is left alone.
 */
export class CatalogEntryInputDto {
  @ApiProperty({ required: false, description: "The song's number in the book" }) @Allow() entryCode?: unknown;
  @ApiProperty({ required: false }) @Allow() title?: unknown;
  @ApiProperty({ required: false }) @Allow() sortTitle?: unknown;
  @ApiProperty({ required: false }) @Allow() subtitle?: unknown;
  @ApiProperty({ required: false, description: 'Another entry, e.g. "JEM 245"' }) @Allow() originalSong?: unknown;
  @ApiProperty({ required: false }) @Allow() originalLanguage?: unknown;
  @ApiProperty({ required: false }) @Allow() artist?: unknown;
  @ApiProperty({ required: false }) @Allow() composer?: unknown;
  @ApiProperty({ required: false }) @Allow() lyricist?: unknown;
  @ApiProperty({ required: false }) @Allow() album?: unknown;
  @ApiProperty({ required: false, type: Number }) @Allow() year?: unknown;
  @ApiProperty({ required: false }) @Allow() key?: unknown;
  @ApiProperty({ required: false, example: "4/4" }) @Allow() timeSignature?: unknown;
  @ApiProperty({ required: false, type: Number }) @Allow() tempo?: unknown;
  @ApiProperty({ required: false }) @Allow() copyright?: unknown;
  @ApiProperty({ required: false }) @Allow() ccli?: unknown;
  @ApiProperty({ required: false }) @Allow() reference?: unknown;
  @ApiProperty({ required: false, type: [String] }) @Allow() tags?: unknown;
  @ApiProperty({ required: false }) @Allow() notes?: unknown;
}
