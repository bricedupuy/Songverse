import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { SearchRecordingsQueryDto } from "./dto/search-recordings-query.dto.js";
import { SearchWorksQueryDto } from "./dto/search-works-query.dto.js";
import { MusicBrainzService } from "./musicbrainz.service.js";

/**
 * Read-only proxy to MusicBrainz - no ownership/edit checks needed here,
 * since nothing is mutated. Linking a match to a Work or Song Version
 * happens through those resources' own endpoints, which do enforce edit
 * rights (see SongVersionsController/WorksController).
 */
@ApiTags("musicbrainz")
@ApiBearerAuth()
@Controller("musicbrainz")
export class MusicBrainzController {
  constructor(private readonly musicBrainz: MusicBrainzService) {}

  @Get("recordings/search")
  @ApiOkResponse({ description: "Candidate recording matches, best score first" })
  searchRecordings(@Query() query: SearchRecordingsQueryDto) {
    return this.musicBrainz.searchRecordings(query.title, query.artist);
  }

  @Get("works/search")
  @ApiOkResponse({ description: "Candidate work (composition) matches, best score first" })
  searchWorks(@Query() query: SearchWorksQueryDto) {
    return this.musicBrainz.searchWorks(query.title);
  }

  @Get("recordings/:mbid")
  getRecording(@Param("mbid") mbid: string) {
    return this.musicBrainz.getRecording(mbid);
  }

  @Get("works/:mbid")
  getWork(@Param("mbid") mbid: string) {
    return this.musicBrainz.getWork(mbid);
  }
}
