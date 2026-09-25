// Songbook numbers (issue #55): stored without a plain number's leading
// zeros, listed in reading order, and given as one reference -
// "JEM 855 · JEM3" - on the song, in search and in a set.
import { api, call, check, finish, tag, user } from "../lib/harness.mjs";

const me = await user("Numbers");
const abbr = [...tag].map((digit) => "ABCDEFGHIJ"[Number(digit)]).join("");
const book = await api(me, "POST", "/songbooks", { name: `Numbered ${tag}`, kind: "NUMBERED", abbreviation: abbr });
await api(me, "PATCH", `/songbooks/${book.id}`, {
  sections: [
    { label: `${abbr}1`, start: 1, end: 99 },
    { label: `${abbr}3`, start: 800, end: 900 },
  ],
});
const songs = {};
for (const code of ["0855", "2", "10", "100", "A-10", "A-2"]) {
  songs[code] = await api(me, "POST", "/song-versions", { title: `Song ${code} ${tag}`, language: "en", artists: ["Someone"] });
  await api(me, "POST", `/songbooks/${book.id}/entries`, { songVersionId: songs[code].id, entryCode: code });
}

let r = await call(me, "GET", `/songbooks/${book.id}`);
const codes = r.body.entries.map((entry) => entry.entryCode);
check("entries in reading order, a plain number without its leading zeros", codes.join() === "2,10,100,855,A-2,A-10", codes.join());

r = await call(me, "POST", `/songbooks/${book.id}/entries`, { songVersionId: (await api(me, "POST", "/song-versions", { title: `Dup ${tag}`, language: "en", artists: ["x"] })).id, entryCode: "002" });
check("002 is 2, already taken", r.status === 409 || r.status === 400, String(r.status));

r = await call(me, "GET", `/song-versions/${songs["0855"].id}/songbooks`);
check("the song's songbooks give its full reference", r.body[0]?.reference === `${abbr} 855 · ${abbr}3` && r.body[0].abbreviation === abbr, JSON.stringify(r.body));
r = await call(me, "GET", `/song-versions/${songs["A-2"].id}/songbooks`);
check("a code outside the volumes has no volume", r.body[0]?.reference === `${abbr} A-2`, JSON.stringify(r.body));

r = await call(me, "GET", `/songbook-entries?q=${encodeURIComponent(`${abbr} 0855`)}`);
check("search ignores leading zeros, and gives the volume", r.body.length === 1 && r.body[0].entryCode === "855" && r.body[0].sectionLabel === `${abbr}3`, JSON.stringify(r.body));

const set = await api(me, "POST", "/setlists", { name: `Refs ${tag}` });
const detail = await api(me, "POST", `/setlists/${set.id}/items`, { songVersionId: songs["0855"].id });
check("a set's song carries its references", detail.items[0].songbookReferences.join() === `${abbr} 855 · ${abbr}3`, JSON.stringify(detail.items[0].songbookReferences));

finish();
