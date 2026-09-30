import { describe, expect, it } from "vite-plus/test";
import { localeFromAcceptLanguage } from "../i18n/accept-language.js";

describe("localeFromAcceptLanguage", () => {
  it("picks the most preferred supported language", () => {
    expect(localeFromAcceptLanguage("fr-CA,fr;q=0.9,en;q=0.8")).toBe("fr");
    expect(localeFromAcceptLanguage("en-US,en;q=0.9,fr;q=0.8")).toBe("en");
  });

  it("skips languages it doesn't have", () => {
    expect(localeFromAcceptLanguage("de-DE,de;q=0.9,fr;q=0.5")).toBe("fr");
  });

  it("orders by q, not by position", () => {
    expect(localeFromAcceptLanguage("en;q=0.2, fr;q=0.8")).toBe("fr");
    expect(localeFromAcceptLanguage("fr;q=0, en")).toBe("en");
  });

  it("falls back to the default", () => {
    expect(localeFromAcceptLanguage(undefined)).toBe("en");
    expect(localeFromAcceptLanguage("")).toBe("en");
    expect(localeFromAcceptLanguage("*")).toBe("en");
    expect(localeFromAcceptLanguage("ja,zh;q=0.5")).toBe("en");
  });
});
