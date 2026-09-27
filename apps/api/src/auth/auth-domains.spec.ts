import { describe, expect, it } from "vitest";
import { passkeyRpId, sharedCookieDomain } from "./auth-domains.js";

describe("sharedCookieDomain", () => {
  it("is the parent both apps share", () => {
    expect(sharedCookieDomain("api.songverse.one", "songverse.one")).toBe("songverse.one");
    expect(sharedCookieDomain("api.songverse.one", "app.songverse.one")).toBe("songverse.one");
  });
  it("is unset when both are on one host (local dev)", () => {
    expect(sharedCookieDomain("localhost", "localhost")).toBeUndefined();
  });
  it("refuses hosts with no common parent", () => {
    expect(() => sharedCookieDomain("api.example.com", "songverse.one")).toThrow(/one parent domain/);
  });
});

describe("passkeyRpId", () => {
  it("stays songverse.one whether the web app is on the root domain or app.songverse.one", () => {
    expect(passkeyRpId("api.songverse.one", "songverse.one")).toBe("songverse.one");
    expect(passkeyRpId("api.songverse.one", "app.songverse.one")).toBe("songverse.one");
  });
  it("is the host itself in local dev", () => {
    expect(passkeyRpId("localhost", "localhost")).toBe("localhost");
  });
});
