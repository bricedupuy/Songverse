import { Controller, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../common/types/authenticated-request";
import { requireUser } from "./setlists.controller";
import { SongOwnershipService } from "./song-ownership.service";

/** Teams asking for songs you own (see SongOwnershipService). */
@ApiTags("setlists")
@ApiBearerAuth()
@Controller("ownership-requests")
export class OwnershipRequestsController {
  constructor(private readonly ownership: SongOwnershipService) {}

  @Get()
  incoming(@CurrentUser() user: AuthenticatedUser | undefined) {
    return this.ownership.incoming(requireUser(user));
  }

  @Post(":requestId/accept")
  @HttpCode(HttpStatus.NO_CONTENT)
  accept(@CurrentUser() user: AuthenticatedUser | undefined, @Param("requestId") requestId: string): Promise<void> {
    return this.ownership.accept(requireUser(user), requestId);
  }

  @Post(":requestId/decline")
  @HttpCode(HttpStatus.NO_CONTENT)
  decline(@CurrentUser() user: AuthenticatedUser | undefined, @Param("requestId") requestId: string): Promise<void> {
    return this.ownership.decline(requireUser(user), requestId);
  }
}
