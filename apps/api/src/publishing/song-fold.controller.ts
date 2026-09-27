import { Controller, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { GlobalAdminGuard } from "../common/guards/global-admin.guard.js";
import { SongFoldService } from "./song-fold.service.js";

@ApiTags("admin")
@ApiBearerAuth()
@Controller("admin")
@UseGuards(GlobalAdminGuard)
export class SongFoldController {
  constructor(private readonly folds: SongFoldService) {}

  /**
   * Folds the songs still published as copies into their catalogue song
   * (issue #75) - done at startup anyway; this runs it again, after
   * restoring an older backup say.
   */
  @Post("fold-copies")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "How many songs were folded." })
  async foldCopies(): Promise<{ folded: number }> {
    return { folded: await this.folds.foldCopies() };
  }
}
