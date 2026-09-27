import { Module } from "@nestjs/common";
import { SongbookCatalogController } from "./songbook-catalog.controller.js";
import { SongbookCatalogService } from "./songbook-catalog.service.js";

@Module({
  controllers: [SongbookCatalogController],
  providers: [SongbookCatalogService],
})
export class SongbookCatalogModule {}
