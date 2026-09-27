import { Module } from "@nestjs/common";
import { PeopleController } from "./people.controller.js";
import { PeopleService } from "./people.service.js";

@Module({
  controllers: [PeopleController],
  providers: [PeopleService],
})
export class PeopleModule {}
