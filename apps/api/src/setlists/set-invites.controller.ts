import { Controller, Get, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Public } from "../common/decorators/public.decorator";
import type { AuthenticatedUser } from "../common/types/authenticated-request";
import { SetlistSharingService } from "./setlist-sharing.service";
import { requireUser } from "./setlists.controller";

/** A set's share link, as opened by the person it was sent to. */
@ApiTags("setlists")
@Controller("set-invites")
export class SetInvitesController {
  constructor(private readonly sharing: SetlistSharingService) {}

  /** What the link leads to, so the page can say before sign-in. */
  @Public()
  @Get(":token")
  preview(@Param("token") token: string) {
    return this.sharing.preview(token);
  }

  @ApiBearerAuth()
  @Post(":token/join")
  join(@CurrentUser() user: AuthenticatedUser | undefined, @Param("token") token: string) {
    return this.sharing.join(requireUser(user), token);
  }
}
