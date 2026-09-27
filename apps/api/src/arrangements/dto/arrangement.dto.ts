import { CreateArrangementSchema, SaveChartPreferencesSchema, SetChartPreferencesSchema, UpdateArrangementSchema } from "@songverse/core";
import { zodDto } from "../../common/zod-validation.js";

export class CreateArrangementDto extends zodDto(CreateArrangementSchema) {}

export class UpdateArrangementDto extends zodDto(UpdateArrangementSchema) {}

export class SetChartPreferencesDto extends zodDto(SetChartPreferencesSchema) {}

export class ChartPreferencesDto extends zodDto(SaveChartPreferencesSchema) {}
