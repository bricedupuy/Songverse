import { describe, expect, it } from "vite-plus/test";
import { inlineSafeType } from "../file-types/index.js";

describe("files shown in the browser (issue #112)", () => {
  it("audio, video, raster images, PDF and plain text are", () => {
    expect(inlineSafeType("audio/mpeg")).toBe("audio/mpeg");
    expect(inlineSafeType("image/PNG")).toBe("image/png");
    expect(inlineSafeType("application/pdf")).toBe("application/pdf");
    expect(inlineSafeType("text/plain")).toBe("text/plain; charset=utf-8");
  });
  it("anything that could carry a script isn't; parameters are dropped", () => {
    expect(inlineSafeType("audio/x; <script>")).toBe("audio/x");
    for (const type of ["text/html", "image/svg+xml", "application/xml", "text/xml", "application/xhtml+xml", "text/javascript", "application/octet-stream", "", null]) {
      expect(inlineSafeType(type)).toBeNull();
    }
  });
});
