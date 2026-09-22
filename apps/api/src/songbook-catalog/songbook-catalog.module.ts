import { Module } from "@nestjs/common";
import { SongbookCatalogController } from "./songbook-catalog.controller";
import { SongbookCatalogService } from "./songbook-catalog.service";

@Module({
  controllers: [SongbookCatalogController],
  providers: [SongbookCatalogService],
})
export class SongbookCatalogModule {}
