import { AppController } from "./app.controller";

describe("AppController", () => {
  it("reports ok on the public health endpoint", () => {
    const controller = new AppController();
    expect(controller.health()).toEqual({ status: "ok" });
  });
});
