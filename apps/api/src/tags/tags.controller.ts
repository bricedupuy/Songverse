import { Controller, Get, UnauthorizedException } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiTags as ApiSwaggerTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../common/types/authenticated-request.js";
import { TagCategoryResponseDto, TagResponseDto } from "./dto/tag-response.dto.js";
import { TagsService } from "./tags.service.js";

@ApiSwaggerTags("tags")
@ApiBearerAuth()
@Controller("tags")
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Get("categories")
  @ApiOkResponse({ type: TagCategoryResponseDto, isArray: true })
  findCategories(): ReturnType<TagsService["findCategories"]> {
    return this.tagsService.findCategories();
  }

  @Get()
  @ApiOkResponse({ type: TagResponseDto, isArray: true })
  findAll(@CurrentUser() user?: AuthenticatedUser): ReturnType<TagsService["findVisibleToUser"]> {
    if (!user) throw new UnauthorizedException();
    return this.tagsService.findVisibleToUser(user.id);
  }
}
