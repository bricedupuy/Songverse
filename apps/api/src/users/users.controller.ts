import { Controller, Get, UnauthorizedException } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../common/types/authenticated-request";
import { UserResponseDto } from "./dto/user-response.dto";
import { UsersService } from "./users.service";

@ApiTags("users")
@ApiBearerAuth()
@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get("me")
  @ApiOkResponse({ type: UserResponseDto })
  findMe(@CurrentUser() user?: AuthenticatedUser) {
    if (!user) throw new UnauthorizedException();
    return this.usersService.findMe(user.id);
  }
}
