import { Module } from "@nestjs/common";
import { SongbooksController } from "./songbooks.controller";
import { SongbooksService } from "./songbooks.service";

@Module({
  controllers: [SongbooksController],
  providers: [SongbooksService],
})
export class SongbooksModule {}
