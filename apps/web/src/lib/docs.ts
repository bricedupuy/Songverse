// The user documentation (apps/docs), published at docs.songverse.one in
// English (at the root) and French (under /fr/).
const DOCS_URL = "https://docs.songverse.one";

// The docs page for each part of the app, by the path it starts with.
const PAGES: [RegExp, string][] = [
  [/^\/library\/[^/]+\/arrangements\//, "arrangements"],
  // A song pulled up on its own in Live: Live is on the Sets page.
  [/^\/library\/[^/]+\/live/, "sets"],
  [/^\/library\/new/, "library"],
  [/^\/library\/[^/]+/, "song-editor"],
  [/^\/library/, "library"],
  [/^\/sets/, "sets"],
  [/^\/songbook/, "songbooks"],
  [/^\/teams/, "teams"],
  [/^\/(admin|review)/, "admin"],
  [/^\/dashboard/, "account"],
];

/** The docs page about where the user is (the docs' home otherwise), in their language. */
export function docsUrl(pathname: string, language: string): string {
  const page = PAGES.find(([pattern]) => pattern.test(pathname))?.[1];
  const locale = language.startsWith("fr") ? "/fr" : "";
  return `${DOCS_URL}${locale}/${page ? `${page}/` : ""}`;
}
