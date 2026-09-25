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
  Patch,
  PayloadTooLargeException,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UnauthorizedException,
  UnsupportedMediaTypeException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { ApiBearerAuth, ApiConsumes, ApiCreatedResponse, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { AccessPolicyService } from "../access/access-policy.service";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { SongVersionOwnerGuard } from "../common/guards/song-version-owner.guard";
import type { AuthenticatedUser } from "../common/types/authenticated-request";
import { AttachmentsService } from "./attachments.service";
import { AttachmentResponseDto } from "./dto/attachment-response.dto";
import { UpdateAttachmentDto, UploadAttachmentDto } from "./dto/upload-attachment.dto";
import { sniffAudioType } from "./sniff-audio";
import { FileLinksService } from "../files/file-links.service";
import { sendFile } from "../files/send-file";
import { StorageService } from "../storage/storage.service";

const MAX_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024;
/** Recordings run bigger than sheets and charts. */
const MAX_AUDIO_SIZE_BYTES = 50 * 1024 * 1024;

@ApiTags("attachments")
@ApiBearerAuth()
@Controller("song-versions/:songVersionId/attachments")
export class AttachmentsController {
  constructor(
    private readonly attachmentsService: AttachmentsService,
    private readonly access: AccessPolicyService,
    private readonly links: FileLinksService,
    private readonly storage: StorageService,
  ) {}

  @Get()
  @ApiOkResponse({ type: AttachmentResponseDto, isArray: true })
  async list(
    @Param("songVersionId") songVersionId: string,
    @CurrentUser() user: AuthenticatedUser | undefined,
  ): Promise<Awaited<ReturnType<AttachmentsService["listForSongVersion"]>>> {
    if (!user) throw new UnauthorizedException();
    await this.access.assertCanSeeSong(user, songVersionId);
    return this.attachmentsService.listForSongVersion(songVersionId);
  }

  @Post()
  @UseGuards(SongVersionOwnerGuard)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_AUDIO_SIZE_BYTES } }))
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
    let mimeType = file.mimetype;
    if (dto.type === "AUDIO") {
      // Browsers give some audio files (.opus, say) no type or a generic one: then the bytes decide.
      if (!mimeType.startsWith("audio/")) mimeType = sniffAudioType(file.buffer) ?? mimeType;
      if (!mimeType.startsWith("audio/")) throw new UnsupportedMediaTypeException("That isn't an audio file");
    } else if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
      throw new PayloadTooLargeException("Files can be up to 25 MB (audio up to 50 MB)");
    }
    return this.attachmentsService.upload(user.id, songVersionId, dto.type, file.originalname, mimeType, file.buffer, dto.stemPart ?? null);
  }

  /** Which part of the song an audio file is, for the stem player (issue #64). */
  @Patch(":attachmentId")
  @UseGuards(SongVersionOwnerGuard)
  @ApiOkResponse({ type: AttachmentResponseDto })
  update(
    @Param("songVersionId") songVersionId: string,
    @Param("attachmentId") attachmentId: string,
    @Body() dto: UpdateAttachmentDto,
  ): ReturnType<AttachmentsService["setStemPart"]> {
    return this.attachmentsService.setStemPart(songVersionId, attachmentId, dto.stemPart);
  }

  /** Streamed, with byte ranges (issue #33). */
  @Get(":attachmentId/download")
  async download(
    @Param("songVersionId") songVersionId: string,
    @Param("attachmentId") attachmentId: string,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    if (!user) throw new UnauthorizedException();
    await this.access.assertCanSeeSong(user, songVersionId);
    const attachment = await this.attachmentsService.find(songVersionId, attachmentId);
    await sendFile(this.storage, attachment, req, res, "attachment");
  }

  /**
   * A short-lived link to the file (GET /files/:id), for what can't send a
   * Bearer token - an <audio src> streaming and seeking (issue #33).
   */
  @Post(":attachmentId/link")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "`path` is under the API's own address; the link stops working at `expiresAt`." })
  async link(
    @Param("songVersionId") songVersionId: string,
    @Param("attachmentId") attachmentId: string,
    @CurrentUser() user: AuthenticatedUser | undefined,
  ): Promise<{ path: string; expiresAt: string }> {
    if (!user) throw new UnauthorizedException();
    await this.access.assertCanSeeSong(user, songVersionId);
    const attachment = await this.attachmentsService.find(songVersionId, attachmentId);
    return this.links.create(attachment.id);
  }

  /** Resized for display, e.g. thumbnails: `w` snaps up to a fixed set of widths (32-2048) and never enlarges. */
  @Get(":attachmentId/image")
  async image(
    @Param("songVersionId") songVersionId: string,
    @Param("attachmentId") attachmentId: string,
    @Query("w") width: string | undefined,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    if (!user) throw new UnauthorizedException();
    if (width === undefined) throw new BadRequestException("The w (width) query parameter is required");
    await this.access.assertCanSeeSong(user, songVersionId);
    const { body, contentType } = await this.attachmentsService.resizedImage(songVersionId, attachmentId, Number(width));
    res.set({
      "Content-Type": contentType,
      // Attachments are never edited in place, so a rendition never changes.
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
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
