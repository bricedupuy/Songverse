# SongVerse docs

The user documentation, published at [docs.songverse.one](https://docs.songverse.one).
Built with [Starlight](https://starlight.astro.build) (Astro).

```sh
pnpm --filter @songverse/docs dev     # http://localhost:4321
pnpm --filter @songverse/docs build   # into dist/, checking every internal link
```

## Writing pages

- English pages are in `src/content/docs/`, French ones at the same path under
  `src/content/docs/fr/`. A page with no French version yet shows the English
  one with a notice.
- The sidebar is in `astro.config.mjs`. A new page goes there too, by its slug.
- Name buttons and menus exactly as the app does: the labels are in
  `packages/core/src/i18n/locales/en.ts` and `fr.ts`.
- Link to other pages with absolute paths: `/sets/`, `/fr/sets/`, with a
  heading's anchor if needed (`/arrangements/#editing-it`). The build fails on
  a link to a page or heading that doesn't exist.

## Screenshots

The screenshots in `src/assets/screenshots/{en,fr}/` are taken by Playwright,
on a fresh copy of the app with demo content, in both languages:

```sh
node e2e/docs/screenshots.mjs              # builds the API and web app first
node e2e/docs/screenshots.mjs --no-build   # reuses the last build
```

It needs Postgres and Redis running (as for the e2e suites), creates a
`songverse_docs` database, and runs the app on ports 3100 and 3101 so it
doesn't disturb a dev server. The demo content and the pages photographed are
in `e2e/docs/capture.mjs`: add a screen there, rerun, and reference the image
from a page:

```md
![A set](../../assets/screenshots/en/set.jpg)          <!-- in src/content/docs/ -->
![Une liste](../../../assets/screenshots/fr/set.jpg)   <!-- in src/content/docs/fr/ -->
```
