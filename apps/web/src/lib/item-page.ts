/**
 * Whether a path is one item's page - a song (and its versions), a set (and
 * its songs), a songbook - where the sidebar starts collapsed to its icons,
 * leaving the room to the item (issue #80). Lists and forms ("new") aren't.
 */
export function isItemPage(pathname: string): boolean {
  return /^\/(library|sets|songbooks)\/(?!(new|artists)\/?$)[^/]+/.test(pathname);
}
