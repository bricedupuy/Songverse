import { describe, expect, it } from "vitest";
import { foldForSearch } from "../search-text/index.js";

describe("foldForSearch", () => {
  it("ignores case and accents", () => {
    expect(foldForSearch("ÉLÉVATION")).toBe("elevation");
    expect(foldForSearch("Hélène Ségara")).toBe("helene segara");
    expect(foldForSearch("À toi la gloire")).toBe("a toi la gloire");
  });

  it("spells ligatures out, as unaccent() does", () => {
    expect(foldForSearch("Mon Cœur")).toBe("mon coeur");
    expect(foldForSearch("Ægir")).toBe("aegir");
    expect(foldForSearch("Straße")).toBe("strasse");
  });
});
