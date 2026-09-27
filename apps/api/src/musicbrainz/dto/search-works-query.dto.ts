import { SearchWorksQuerySchema } from "@songverse/core";
import { zodDto } from "../../common/zod-validation.js";

export class SearchWorksQueryDto extends zodDto(SearchWorksQuerySchema) {}
