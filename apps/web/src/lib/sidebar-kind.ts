/**
 * Which sidebar a page gets on a wider screen (issue #80): the full one,
 * with every section and its lists, on a section's own page (Library's
 * home, Sets, Songbooks…); the rail and its panel once you're inside one -
 * a song, Artists, a smart list or your favorites, a set, a songbook, a
 * team - to go from one to the next.
 */
export function nestedSidebarFor(pathname: string, search: Record<string, unknown>): boolean {
  if (/^\/library\/(?!new\/?$)[^/]+/.test(pathname)) return true;
  if (pathname === "/library" && (search.list || search.favorites || search.artist)) return true;
  return /^\/(sets|songbooks|teams)\/(?!new\/?$)[^/]+/.test(pathname);
}
