import { Module } from "@nestjs/common";
import { OwnershipRequestsController } from "./ownership-requests.controller";
import { SetInvitesController } from "./set-invites.controller";
import { SetlistAccessService } from "./setlist-access.service";
import { SetlistSharingService } from "./setlist-sharing.service";
import { SetlistsController } from "./setlists.controller";
import { SetlistsService } from "./setlists.service";
import { SongOwnershipService } from "./song-ownership.service";

@Module({
  controllers: [SetlistsController, SetInvitesController, OwnershipRequestsController],
  providers: [SetlistAccessService, SetlistsService, SetlistSharingService, SongOwnershipService],
})
export class SetlistsModule {}
