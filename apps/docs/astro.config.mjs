// @ts-check
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import starlightLinksValidator from "starlight-links-validator";

// SongVerse's user documentation (docs.songverse.one), in the app's
// languages: English at the root, French under /fr/. Each page's French
// version lives at the same path under src/content/docs/fr/; a page not
// translated yet shows the English one with a notice.
export default defineConfig({
  site: "https://docs.songverse.one",
  integrations: [
    starlight({
      title: "SongVerse",
      // A link to a page or heading that doesn't exist fails the build.
      plugins: [starlightLinksValidator()],
      description: "How to use SongVerse: songs, arrangements, sets and songbooks for worship teams and bands.",
      logo: { light: "./src/assets/logo-light.svg", dark: "./src/assets/logo-dark.svg", alt: "SongVerse" },
      favicon: "/favicon.svg",
      customCss: ["./src/styles/theme.css"],
      defaultLocale: "root",
      locales: {
        root: { label: "English", lang: "en" },
        fr: { label: "Français", lang: "fr" },
      },
      social: [{ icon: "external", label: "SongVerse", href: "https://songverse.one" }],
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
            { slug: "arrangements" },
          ],
        },
        {
          label: "Playing together",
          translations: { fr: "Jouer ensemble" },
          items: [
            { slug: "sets" },
            { slug: "songbooks" },
            { slug: "teams" },
            { slug: "offline" },
          ],
        },
        { slug: "admin" },
      ],
    }),
  ],
});
