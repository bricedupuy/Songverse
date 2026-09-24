import { Module } from "@nestjs/common";
import { ArrangementsModule } from "../arrangements/arrangements.module";
import { OwnershipRequestsController } from "./ownership-requests.controller";
import { SetInvitesController } from "./set-invites.controller";
import { SetlistAccessService } from "./setlist-access.service";
import { SetlistSharingService } from "./setlist-sharing.service";
import { SetlistsController } from "./setlists.controller";
import { SetlistsService } from "./setlists.service";
import { SongOwnershipService } from "./song-ownership.service";

@Module({
  imports: [ArrangementsModule],
  controllers: [SetlistsController, SetInvitesController, OwnershipRequestsController],
  providers: [SetlistAccessService, SetlistsService, SetlistSharingService, SongOwnershipService],
  exports: [SetlistsService],
})
export class SetlistsModule {}
