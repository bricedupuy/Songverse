/**
 * Which sidebar a page gets on a wider screen (issue #80): the full one,
 * with every section and its lists, on a section's pages and its lists
 * (Library, Songs, Favorites, Artists, Sets, Songbooks…); the rail and its
 * panel on one item - a song, a set, a songbook, a team - with the list it
 * was opened from beside it, to go from one to the next.
 */
export function nestedSidebarFor(pathname: string): boolean {
  // Artists' pages (issue #86) keep the full sidebar, like the list of artists.
  if (/^\/library\/(?!(new|songs|artists)(\/|$))[^/]+/.test(pathname)) return true;
  return /^\/(sets|songbooks|teams)\/(?!new\/?$)[^/]+/.test(pathname);
}
