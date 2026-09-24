import { describe, expect, it } from "vitest";
import en from "../i18n/locales/en.js";
import fr from "../i18n/locales/fr.js";

// The web app loads only the reader's language, with no English underneath,
// so every language must have every key English has.
const keys = (messages: object, prefix = ""): string[] =>
  Object.entries(messages).flatMap(([key, value]) =>
    value && typeof value === "object" ? keys(value, `${prefix}${key}.`) : [`${prefix}${key}`],
  );

describe("locales", () => {
  it("French has exactly English's keys", () => {
    const [english, french] = [new Set(keys(en)), new Set(keys(fr))];
    expect([...english].filter((key) => !french.has(key))).toEqual([]);
    expect([...french].filter((key) => !english.has(key))).toEqual([]);
  });
});
