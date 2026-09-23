import { FileInterceptor } from "@nestjs/platform-express";
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  StreamableFile,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { ApiBearerAuth, ApiConsumes, ApiCreatedResponse, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { SongVersionOwnerGuard } from "../common/guards/song-version-owner.guard";
import type { AuthenticatedUser } from "../common/types/authenticated-request";
import { SongVersionsService } from "../song-versions/song-versions.service";
import { AttachmentsService } from "./attachments.service";
import { AttachmentResponseDto } from "./dto/attachment-response.dto";
import { UploadAttachmentDto } from "./dto/upload-attachment.dto";

const MAX_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024;

@ApiTags("attachments")
@ApiBearerAuth()
@Controller("song-versions/:songVersionId/attachments")
export class AttachmentsController {
  constructor(
    private readonly attachmentsService: AttachmentsService,
    private readonly songVersionsService: SongVersionsService,
  ) {}

  @Get()
  @ApiOkResponse({ type: AttachmentResponseDto, isArray: true })
  async list(
    @Param("songVersionId") songVersionId: string,
    @CurrentUser() user: AuthenticatedUser | undefined,
  ): Promise<Awaited<ReturnType<AttachmentsService["listForSongVersion"]>>> {
    if (!user) throw new UnauthorizedException();
    await this.songVersionsService.assertVisibleById(user, songVersionId);
    return this.attachmentsService.listForSongVersion(songVersionId);
  }

  @Post()
  @UseGuards(SongVersionOwnerGuard)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_ATTACHMENT_SIZE_BYTES } }))
  @ApiConsumes("multipart/form-data")
  @ApiCreatedResponse({ type: AttachmentResponseDto })
  upload(
    @Param("songVersionId") songVersionId: string,
    @Body() dto: UploadAttachmentDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser | undefined,
  ): ReturnType<AttachmentsService["upload"]> {
    if (!user) throw new UnauthorizedException();
    if (!file) throw new BadRequestException("A file is required");
    return this.attachmentsService.upload(user.id, songVersionId, dto.type, file.originalname, file.mimetype, file.buffer);
  }

  @Get(":attachmentId/download")
  async download(
    @Param("songVersionId") songVersionId: string,
    @Param("attachmentId") attachmentId: string,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    if (!user) throw new UnauthorizedException();
    await this.songVersionsService.assertVisibleById(user, songVersionId);
    const { attachment, body } = await this.attachmentsService.download(songVersionId, attachmentId);
    res.set({
      "Content-Type": attachment.mimeType,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(attachment.filename)}"`,
    });
    return new StreamableFile(body);
  }

  @Delete(":attachmentId")
  @UseGuards(SongVersionOwnerGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param("songVersionId") songVersionId: string, @Param("attachmentId") attachmentId: string): Promise<void> {
    return this.attachmentsService.remove(songVersionId, attachmentId);
  }
}
