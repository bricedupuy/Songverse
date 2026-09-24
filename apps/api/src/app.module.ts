import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { AdminModule } from "./admin/admin.module";
import { AccessModule } from "./access/access.module";
import { AppController } from "./app.controller";
import { AttachmentsModule } from "./attachments/attachments.module";
import { AuthModule } from "./auth/auth.module";
import { BulkUploadModule } from "./bulk-upload/bulk-upload.module";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { MusicBrainzModule } from "./musicbrainz/musicbrainz.module";
import { PrismaModule } from "./prisma/prisma.module";
import { SongbookCatalogModule } from "./songbook-catalog/songbook-catalog.module";
import { SetlistsModule } from "./setlists/setlists.module";
import { SongbooksModule } from "./songbooks/songbooks.module";
import { SongVersionsModule } from "./song-versions/song-versions.module";
import { TagsModule } from "./tags/tags.module";
import { TeamsModule } from "./teams/teams.module";
import { UsersModule } from "./users/users.module";
import { WorksModule } from "./works/works.module";
import { PublishingModule } from "./publishing/publishing.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: { url: config.getOrThrow<string>("REDIS_URL") },
      }),
    }),
    PrismaModule,
    AccessModule,
    AuthModule,
    UsersModule,
    TeamsModule,
    WorksModule,
    SongVersionsModule,
    SongbooksModule,
    SetlistsModule,
    SongbookCatalogModule,
    TagsModule,
    MusicBrainzModule,
    AttachmentsModule,
    BulkUploadModule,
    AdminModule,
    PublishingModule,
  ],
  controllers: [AppController],
  providers: [
    // JwtAuthGuard runs on every route by default; opt out with @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
