import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Query, UnauthorizedException } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../common/types/authenticated-request";
import {
  AddSetlistItemDto,
  CreateSetlistDto,
  ReorderSetlistItemsDto,
  UpdateSetlistDto,
  UpdateSetlistItemDto,
} from "./dto/setlist.dto";
import { SetlistsService } from "./setlists.service";

function requireUser(user: AuthenticatedUser | undefined): AuthenticatedUser {
  if (!user) throw new UnauthorizedException();
  return user;
}

/** Item-changing endpoints return the whole updated set, so the client never has to re-fetch. */
@ApiTags("setlists")
@ApiBearerAuth()
@Controller("setlists")
export class SetlistsController {
  constructor(private readonly setlists: SetlistsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser | undefined) {
    return this.setlists.list(requireUser(user));
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser | undefined, @Body() dto: CreateSetlistDto) {
    return this.setlists.create(requireUser(user), dto);
  }

  @Get(":setlistId")
  findOne(@CurrentUser() user: AuthenticatedUser | undefined, @Param("setlistId") setlistId: string) {
    return this.setlists.findOne(requireUser(user), setlistId);
  }

  @Patch(":setlistId")
  update(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param("setlistId") setlistId: string,
    @Body() dto: UpdateSetlistDto,
  ) {
    return this.setlists.update(requireUser(user), setlistId, dto);
  }

  @Delete(":setlistId")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthenticatedUser | undefined, @Param("setlistId") setlistId: string): Promise<void> {
    return this.setlists.remove(requireUser(user), setlistId);
  }

  @Get(":setlistId/song-candidates")
  candidates(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param("setlistId") setlistId: string,
    @Query("q") query: string | undefined,
  ) {
    return this.setlists.candidates(requireUser(user), setlistId, query);
  }

  @Post(":setlistId/items")
  addItem(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param("setlistId") setlistId: string,
    @Body() dto: AddSetlistItemDto,
  ) {
    return this.setlists.addItem(requireUser(user), setlistId, dto);
  }

  @Put(":setlistId/items/order")
  reorder(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param("setlistId") setlistId: string,
    @Body() dto: ReorderSetlistItemsDto,
  ) {
    return this.setlists.reorder(requireUser(user), setlistId, dto.itemIds);
  }

  @Patch(":setlistId/items/:itemId")
  updateItem(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param("setlistId") setlistId: string,
    @Param("itemId") itemId: string,
    @Body() dto: UpdateSetlistItemDto,
  ) {
    return this.setlists.updateItem(requireUser(user), setlistId, itemId, dto);
  }

  @Delete(":setlistId/items/:itemId")
  removeItem(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param("setlistId") setlistId: string,
    @Param("itemId") itemId: string,
  ) {
    return this.setlists.removeItem(requireUser(user), setlistId, itemId);
  }
}
