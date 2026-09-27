// @ts-check
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import starlightLinksValidator from "starlight-links-validator";

// Songverse's user documentation (docs.songverse.one), in the app's
// languages: English at the root, French under /fr/. Each page's French
// version lives at the same path under src/content/docs/fr/; a page not
// translated yet shows the English one with a notice.
export default defineConfig({
  site: "https://docs.songverse.one",
  // Arrangements are called versions since #78: old links still land.
  redirects: { "/arrangements/": "/versions/", "/fr/arrangements/": "/fr/versions/" },
  integrations: [
    starlight({
      title: "Songverse",
      // A link to a page or heading that doesn't exist fails the build.
      plugins: [starlightLinksValidator()],
      description: "How to use Songverse: songs, versions, sets and songbooks for worship teams and bands.",
      logo: { light: "./src/assets/logo-light.svg", dark: "./src/assets/logo-dark.svg", alt: "Songverse" },
      favicon: "/favicon.svg",
      customCss: ["./src/styles/theme.css"],
      defaultLocale: "root",
      locales: {
        root: { label: "English", lang: "en" },
        fr: { label: "Français", lang: "fr" },
      },
      social: [{ icon: "external", label: "Songverse", href: "https://songverse.one" }],
      sidebar: [
        {
          label: "Start here",
          translations: { fr: "Pour commencer" },
          items: [
            { slug: "getting-started" },
            { slug: "account" },
          ],
        },
        {
          label: "Songs",
          translations: { fr: "Chants" },
          items: [
            { slug: "library" },
            { slug: "song-editor" },
            { slug: "versions" },
          ],
        },
        {
          label: "Playing together",
          translations: { fr: "Jouer ensemble" },
          items: [
            { slug: "sets" },
            { slug: "metronome" },
            { slug: "songbooks" },
            { slug: "teams" },
            { slug: "people" },
            { slug: "offline" },
          ],
        },
        { slug: "admin" },
      ],
    }),
  ],
});
