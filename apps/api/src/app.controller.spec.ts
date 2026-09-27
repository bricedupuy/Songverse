import { describe, expect, it } from "vitest";
import { AppController } from "./app.controller.js";

describe("AppController", () => {
  it("reports ok on the public health endpoint", () => {
    const controller = new AppController();
    expect(controller.health()).toEqual({ status: "ok" });
  });
});
