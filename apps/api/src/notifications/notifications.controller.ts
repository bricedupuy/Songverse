import { Body, Controller, Get, Post, Query, UnauthorizedException } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../common/types/authenticated-request.js";
import { MarkNotificationsReadDto, NotificationsQueryDto } from "./dto/notifications.dto.js";
import { NotificationsService } from "./notifications.service.js";

/** One's own notifications (issue #236). */
@ApiTags("notifications")
@ApiBearerAuth()
@Controller("users/me/notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /** Newest first, with how many are unread. */
  @Get()
  list(@CurrentUser() user: AuthenticatedUser | undefined, @Query() query: NotificationsQueryDto) {
    if (!user) throw new UnauthorizedException();
    return this.notifications.list(user.id, query.before, query.limit);
  }

  /** How many are unread: for the bell's badge, asked for often. */
  @Get("unread")
  async unread(@CurrentUser() user: AuthenticatedUser | undefined) {
    if (!user) throw new UnauthorizedException();
    return { unread: await this.notifications.unread(user.id) };
  }

  /** These notifications marked read, or all of them when no `ids` are given. */
  @Post("read")
  read(@CurrentUser() user: AuthenticatedUser | undefined, @Body() dto: MarkNotificationsReadDto) {
    if (!user) throw new UnauthorizedException();
    return this.notifications.markRead(user.id, dto.ids);
  }
}
