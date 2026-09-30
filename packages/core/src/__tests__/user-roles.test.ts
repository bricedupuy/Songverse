import { describe, expect, it } from "vite-plus/test";
import { orderInstruments, orderTechRoles } from "../user-roles/index.js";

describe("orderInstruments", () => {
  it("dedupes, drops unknown values and keeps the list's order", () => {
    expect(orderInstruments(["DRUMS", "KAZOO", "LEAD_VOCALS", "DRUMS"])).toEqual(["LEAD_VOCALS", "DRUMS"]);
  });

  it("handles an empty list", () => {
    expect(orderInstruments([])).toEqual([]);
  });
});

describe("orderTechRoles", () => {
  it("keeps the list's order", () => {
    expect(orderTechRoles(["SOUND_ENGINEER", "TECHNICIAN"])).toEqual(["TECHNICIAN", "SOUND_ENGINEER"]);
  });
});
