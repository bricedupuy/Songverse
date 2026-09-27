import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UnauthorizedException } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../common/types/authenticated-request.js";
import { CreateSuggestionDto, ListSuggestionsQueryDto, ReviewSuggestionDto } from "./suggestions.dto.js";
import { SuggestionsService } from "./suggestions.service.js";

function requireUser(user: AuthenticatedUser | undefined): AuthenticatedUser {
  if (!user) throw new UnauthorizedException();
  return user;
}

/** Suggested changes to catalogue songs (issue #74). */
@ApiTags("suggestions")
@ApiBearerAuth()
@Controller()
export class SuggestionsController {
  constructor(private readonly suggestions: SuggestionsService) {}

  @Post("song-versions/:songVersionId/suggestions")
  create(@CurrentUser() user: AuthenticatedUser | undefined, @Param("songVersionId") songVersionId: string, @Body() dto: CreateSuggestionDto) {
    return this.suggestions.create(requireUser(user), songVersionId, dto);
  }

  /** Your own suggestions on this song. */
  @Get("song-versions/:songVersionId/suggestions")
  forSong(@CurrentUser() user: AuthenticatedUser | undefined, @Param("songVersionId") songVersionId: string) {
    return this.suggestions.mine(requireUser(user), songVersionId);
  }

  @Get("suggestions")
  list(@CurrentUser() user: AuthenticatedUser | undefined, @Query() query: ListSuggestionsQueryDto) {
    return this.suggestions.list(requireUser(user), query.state ?? "open");
  }

  @Get("suggestions/mine")
  mine(@CurrentUser() user: AuthenticatedUser | undefined) {
    return this.suggestions.mine(requireUser(user));
  }

  @Get("suggestions/:id")
  findOne(@CurrentUser() user: AuthenticatedUser | undefined, @Param("id") id: string) {
    return this.suggestions.findOne(requireUser(user), id);
  }

  @Post("suggestions/:id/accept")
  @HttpCode(HttpStatus.OK)
  accept(@CurrentUser() user: AuthenticatedUser | undefined, @Param("id") id: string, @Body() dto: ReviewSuggestionDto) {
    return this.suggestions.accept(requireUser(user), id, dto.notes);
  }

  @Post("suggestions/:id/decline")
  @HttpCode(HttpStatus.OK)
  decline(@CurrentUser() user: AuthenticatedUser | undefined, @Param("id") id: string, @Body() dto: ReviewSuggestionDto) {
    return this.suggestions.decline(requireUser(user), id, dto.notes);
  }

  @Post("suggestions/:id/withdraw")
  @HttpCode(HttpStatus.OK)
  withdraw(@CurrentUser() user: AuthenticatedUser | undefined, @Param("id") id: string) {
    return this.suggestions.withdraw(requireUser(user), id);
  }
}
