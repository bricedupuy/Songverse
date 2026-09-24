import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../common/types/authenticated-request";
import { OfflineSyncDto } from "./dto/setlist.dto";
import { requireUser } from "./setlists.controller";
import { SetlistsService } from "./setlists.service";

/** Keeping a device's offline copy current (docs/offline.md, issue #51); the mobile app uses it too. */
@ApiTags("offline")
@ApiBearerAuth()
@Controller("offline")
export class OfflineController {
  constructor(private readonly setlists: SetlistsService) {}

  @Post("sync")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "What a device should keep offline now",
    description:
      "Send the sets the device keeps, with their versions. The answer lists the upcoming sets (dated from yesterday to `days` ahead, default 14) and the known sets still visible, each with its current version and - only when that differs from the device's - its full copy (as GET /setlists/:id/offline returns it). Known sets that were deleted or can no longer be opened are listed in `gone`: remove them.",
  })
  sync(@CurrentUser() user: AuthenticatedUser | undefined, @Body() dto: OfflineSyncDto) {
    return this.setlists.offlineSync(requireUser(user), dto);
  }
}
