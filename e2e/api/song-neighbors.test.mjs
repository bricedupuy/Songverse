// Previous and next in a list (issue #84): the songs before and after one
// in a list of the library - searched, filtered and sorted - and where it
// is in it; nothing when it isn't in the list; only songs you can see.
import { api, call, check, finish, stamp, user } from "../lib/harness.mjs";

const me = await user("Neighbor");
const other = await user("Stranger");
const make = (title) => api(me, "POST", "/song-versions", { title: `${title} ${stamp}`, language: "en", artists: ["Someone"] });
const [a, b, c] = [await make("Nabla A"), await make("Nabla B"), await make("Nabla C")];
const theirs = await api(other, "POST", "/song-versions", { title: `Nabla Z ${stamp}`, language: "en", artists: ["Someone"] });
const near = (id, query) => api(me, "GET", `/song-versions/${id}/neighbors?${new URLSearchParams(query)}`);

let r = await near(b.id, { q: `Nabla`, sort: "title", dir: "asc" });
check("in the middle: both sides, and where it is", r.position === 2 && r.total === 3 && r.previous?.id === a.id && r.next?.id === c.id, JSON.stringify(r));
r = await near(a.id, { q: `Nabla`, sort: "title", dir: "asc" });
check("first: nothing before", r.position === 1 && r.previous === null && r.next?.id === b.id);
r = await near(a.id, { q: `Nabla`, sort: "title", dir: "desc" });
check("the list's own order", r.position === 3 && r.previous?.id === b.id && r.next === null, JSON.stringify(r));
check("not what you can't see", r.total === 3);

await api(me, "PUT", `/song-versions/${c.id}/favorite`);
await api(me, "PUT", `/song-versions/${a.id}/favorite`);
r = await near(c.id, { favorites: "true", sort: "title", dir: "asc" });
check("in your favorites", r.position === 2 && r.total === 2 && r.previous?.id === a.id && r.next === null, JSON.stringify(r));
r = await near(b.id, { favorites: "true" });
check("not in the list: no position", r.position === null && r.previous === null && r.next === null);
r = await call(me, "GET", `/song-versions/${theirs.id}/neighbors`);
check("a song you can't see", r.status === 403, String(r.status));

finish();
