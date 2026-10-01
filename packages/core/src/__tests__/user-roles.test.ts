import { describe, expect, it } from "vite-plus/test";
import { orderInstruments, orderTechRoles } from "../user-roles/index.js";

describe("orderInstruments", () => {
  it("dedupes, drops unknown values and keeps the list's order", () => {
    expect(orderInstruments(["DRUMS", "KAZOO", "LEAD_VOCALS", "DRUMS"])).toEqual(["LEAD_VOCALS", "DRUMS"]);
  });

  it("puts the instruments an admin added after the built-in ones, in their order (issue #166)", () => {
    expect(orderInstruments(["nyckel", "DRUMS", "gone", "theremin"], ["theremin", "nyckel"])).toEqual(["DRUMS", "theremin", "nyckel"]);
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
