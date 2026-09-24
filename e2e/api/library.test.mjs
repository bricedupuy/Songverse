// The song list: paging, search, sorting, filters, stats - and only songs you can see.
import { call, check, finish, sql, stamp, user } from "../lib/harness.mjs";

const me = await user("owner");
const other = await user("other");
const song = async (who, fields) =>
  (await call(who, "POST", "/song-versions", { language: "en", artists: ["Test Artist"], ...fields })).body;

// 60 songs, so there's more than one page at the default size of 50.
for (let i = 1; i <= 60; i++) {
  await song(me, { title: `Lib ${stamp} ${String(i).padStart(2, "0")}`, ...(i === 7 && { language: "fr" }) });
}
const special = await song(me, { title: `Grâce ${stamp}`, artists: ["Hillsong Worship", "Brooke Ligertwood"], versionName: "Acoustic", ccli: `9${stamp % 1000000}` });
await song(other, { title: `Lib ${stamp} theirs`, artists: ["Hillsong Worship"] });
const tagId = sql(`select id from "Tag" where scope='GLOBAL' and "isApproved" limit 1`);
await call(me, "PATCH", `/song-versions/${special.id}`, { tagIds: [tagId] });

let r = await call(me, "GET", `/song-versions?q=${encodeURIComponent(`Lib ${stamp}`)}`);
check("first page of 50, with the total", r.status === 200 && r.body.items.length === 50 && r.body.total === 60 && r.body.page === 1 && r.body.pageSize === 50, JSON.stringify({ n: r.body.items?.length, total: r.body.total }));
check("someone else's song isn't counted", !r.body.items.some((s) => s.title.endsWith("theirs")));
r = await call(me, "GET", `/song-versions?q=${encodeURIComponent(`Lib ${stamp}`)}&page=2`);
check("second page has the rest", r.body.items.length === 10 && r.body.page === 2);

r = await call(me, "GET", `/song-versions?q=${encodeURIComponent(`lib ${stamp}`)}&sort=title&pageSize=3`);
check("sorted by title, ascending by default", r.body.items.map((s) => s.title.slice(-2)).join() === "01,02,03", r.body.items.map((s) => s.title).join(" | "));
r = await call(me, "GET", `/song-versions?q=${encodeURIComponent(`lib ${stamp}`)}&sort=title&dir=desc&pageSize=2`);
check("and descending", r.body.items.map((s) => s.title.slice(-2)).join() === "60,59");

r = await call(me, "GET", `/song-versions?q=hillsong`);
check("search matches an artist, only in songs you can see", r.body.items.some((s) => s.id === special.id) && !r.body.items.some((s) => s.title.endsWith("theirs")));
r = await call(me, "GET", `/song-versions?q=acoustic`);
check("search matches a version name", r.body.items.some((s) => s.id === special.id));
r = await call(me, "GET", `/song-versions?q=${special.ccli ?? `9${stamp % 1000000}`}`);
check("search matches a CCLI number", r.body.items.some((s) => s.id === special.id), JSON.stringify(r.body.items?.map((s) => s.title)));
r = await call(me, "GET", `/song-versions?q=${encodeURIComponent(`Lib ${stamp}`)}&language=fr`);
check("filter by language", r.body.total === 1 && r.body.items[0].title.endsWith(" 07"));
r = await call(me, "GET", `/song-versions?tagId=${tagId}&q=${stamp}`);
check("filter by tag", r.body.total === 1 && r.body.items[0].id === special.id);

r = await call(me, "GET", "/song-versions?pageSize=500");
check("page size is capped", r.status === 400);
r = await call(me, "GET", "/song-versions?sort=artist");
check("unknown sort refused", r.status === 400);

r = await call(me, "GET", "/song-versions/stats");
const own = Number(sql(`select count(*) from "SongVersion" where "ownerUserId"='${me.id}'`));
const globals = Number(sql(`select count(*) from "SongVersion" where "ownerScope"='GLOBAL' and "publicationState"='APPROVED'`));
check("stats count every song you can see", r.status === 200 && r.body.songCount === own + globals, JSON.stringify(r.body));
check("stats count distinct artists", r.body.artistCount >= 3);

// --- search stays current however a song or its credits change (kept by database triggers)
const found = async (q) => (await call(me, "GET", `/song-versions?q=${encodeURIComponent(q)}`)).body.items.map((item) => item.id);
const tracked = await song(me, { title: `Searchable ${stamp}`, artists: [`Zephyr Quill ${stamp}`], versionName: `Acoustic ${stamp}` });
check("found by an artist, the title and the version name", (await found(`zephyr quill ${stamp}`)).includes(tracked.id) && (await found(`SEARCHABLE ${stamp}`)).includes(tracked.id) && (await found(`acoustic ${stamp}`)).includes(tracked.id));
await call(me, "PATCH", `/song-versions/${tracked.id}`, { title: `Renamed ${stamp}`, artists: [`Marlow Finch ${stamp}`] });
check(
  "after a rename and new artists, the new ones find it and the old ones don't",
  (await found(`renamed ${stamp}`)).includes(tracked.id) && (await found(`marlow finch ${stamp}`)).includes(tracked.id) &&
    !(await found(`searchable ${stamp}`)).includes(tracked.id) && !(await found(`zephyr quill ${stamp}`)).includes(tracked.id),
);
check(
  "a composer isn't what the library search matches",
  !(await found(`Nobody Composer ${stamp}`)).length &&
    (await call(me, "PATCH", `/song-versions/${tracked.id}`, { composers: [`Nobody Composer ${stamp}`] })).status === 200 &&
    !(await found(`Nobody Composer ${stamp}`)).includes(tracked.id),
);

// --- credit autocomplete: every matching credit counted, names starting with the query first
for (let i = 0; i < 3; i++) await song(me, { title: `Credit ${stamp} ${i}`, artists: [`Alder Moss ${stamp}`] });
await song(me, { title: `Credit ${stamp} x`, artists: [`Moss Alder ${stamp}`], composers: [`Alder Moss ${stamp}`] });
r = await call(me, "GET", `/song-versions/credits?q=${encodeURIComponent(`moss`)}`);
const alder = r.body.find((c) => c.name === `Alder Moss ${stamp}`);
const moss = r.body.find((c) => c.name === `Moss Alder ${stamp}`);
check(
  "a name is counted across every song and role it's credited on",
  alder?.songCount === 4 && alder.roles.includes("PERFORMER") && alder.roles.includes("COMPOSER"),
  JSON.stringify(alder),
);
check("names starting with the query come before those only containing it", !!moss && r.body.indexOf(moss) < r.body.indexOf(alder), JSON.stringify(r.body.map((c) => c.name)));
r = await call(other, "GET", `/song-versions/credits?q=${encodeURIComponent(`Alder Moss ${stamp}`)}`);
check("credits on songs you can't see aren't suggested", r.status === 200 && r.body.length === 0, JSON.stringify(r.body));

finish();
