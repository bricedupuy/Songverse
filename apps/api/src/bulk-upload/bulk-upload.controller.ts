import { FilesInterceptor } from "@nestjs/platform-express";
import { Body, Controller, Param, Post, UnauthorizedException, UseGuards, UseInterceptors, UploadedFiles } from "@nestjs/common";
import { ApiBearerAuth, ApiConsumes, ApiCreatedResponse, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { SongbookOwnerGuard } from "../common/guards/songbook-owner.guard.js";
import type { AuthenticatedUser } from "../common/types/authenticated-request.js";
import { BulkUploadService } from "./bulk-upload.service.js";
import { BulkUploadCommitDto } from "./dto/bulk-upload-commit.dto.js";
import { BulkUploadPreviewDto } from "./dto/bulk-upload-preview.dto.js";
import { BulkUploadCommitResultDto, BulkUploadFileMatchDto } from "./dto/bulk-upload-response.dto.js";

const MAX_BULK_UPLOAD_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const MAX_BULK_UPLOAD_FILES_PER_REQUEST = 200;

@ApiTags("bulk-upload")
@ApiBearerAuth()
@Controller("songbooks/:songbookId/bulk-upload")
@UseGuards(SongbookOwnerGuard)
export class BulkUploadController {
  constructor(private readonly bulkUploadService: BulkUploadService) {}

  @Post("preview")
  @ApiOkResponse({ type: BulkUploadFileMatchDto, isArray: true })
  preview(
    @Param("songbookId") songbookId: string,
    @Body() dto: BulkUploadPreviewDto,
  ): ReturnType<BulkUploadService["preview"]> {
    return this.bulkUploadService.preview(songbookId, dto.filenames);
  }

  @Post()
  @UseInterceptors(
    FilesInterceptor("files", MAX_BULK_UPLOAD_FILES_PER_REQUEST, { limits: { fileSize: MAX_BULK_UPLOAD_FILE_SIZE_BYTES } }),
  )
  @ApiConsumes("multipart/form-data")
  @ApiCreatedResponse({ type: BulkUploadCommitResultDto })
  commit(
    @Param("songbookId") songbookId: string,
    @Body() dto: BulkUploadCommitDto,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @CurrentUser() user: AuthenticatedUser | undefined,
  ): ReturnType<BulkUploadService["commit"]> {
    if (!user) throw new UnauthorizedException();
    return this.bulkUploadService.commit(user.id, songbookId, dto.type, files ?? []);
  }
}
