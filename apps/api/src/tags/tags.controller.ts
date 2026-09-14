import { Controller, Get, UnauthorizedException } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiTags as ApiSwaggerTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../common/types/authenticated-request";
import { TagCategoryResponseDto, TagResponseDto } from "./dto/tag-response.dto";
import { TagsService } from "./tags.service";

@ApiSwaggerTags("tags")
@ApiBearerAuth()
@Controller("tags")
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Get("categories")
  @ApiOkResponse({ type: TagCategoryResponseDto, isArray: true })
  findCategories() {
    return this.tagsService.findCategories();
  }

  @Get()
  @ApiOkResponse({ type: TagResponseDto, isArray: true })
  findAll(@CurrentUser() user?: AuthenticatedUser) {
    if (!user) throw new UnauthorizedException();
    return this.tagsService.findVisibleToUser(user.id);
  }
}
