// @ts-check
import { defineConfig } from "astro/config";

// The website at the root of songverse.one (#43): one static page, in
// English (/) and French (/fr/), pointing to the app and the docs.
export default defineConfig({
  site: "https://songverse.one",
});
