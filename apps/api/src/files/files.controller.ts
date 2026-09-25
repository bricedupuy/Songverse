import { Controller, ForbiddenException, Get, Param, Query, Req, Res } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { Public } from "../common/decorators/public.decorator";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { FileLinksService } from "./file-links.service";
import { sendFile } from "./send-file";

/** A file by a signed link (issue #33): see POST /song-versions/:id/attachments/:id/link. */
@ApiTags("attachments")
@Controller("files")
export class FilesController {
  constructor(
    private readonly links: FileLinksService,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  @Public()
  @Get(":attachmentId")
  @ApiOkResponse({ description: "The file's bytes, or the byte range asked for (206). No Bearer token: the link is the permission." })
  async file(
    @Param("attachmentId") attachmentId: string,
    @Query("expires") expires: string | undefined,
    @Query("signature") signature: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    if (!this.links.isValid(attachmentId, expires, signature)) throw new ForbiddenException("This link has expired or isn't valid");
    const attachment = await this.prisma.client.attachment.findUnique({ where: { id: attachmentId } });
    // Deleted since the link was given.
    if (!attachment) throw new ForbiddenException("This link has expired or isn't valid");
    await sendFile(this.storage, attachment, req, res, "inline");
  }
}
