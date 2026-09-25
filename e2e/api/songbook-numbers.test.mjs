// Songbook numbers (issue #55): stored without a plain number's leading
// zeros, listed in reading order, and given as one reference -
// "JEM 855 · JEM3" - on the song, in search and in a set.
import { api, call, check, finish, sql, tag, user } from "../lib/harness.mjs";

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


// --- printed volumes in the catalogue
const admin = await user("Catalogue admin");
sql(`update "User" set "isGlobalAdmin"=true where id='${admin.id}'`);
const catalog = await api(admin, "POST", "/songbook-catalogs", { name: `Volumes ${tag}`, abbreviation: `V${abbr}` });
await api(admin, "POST", `/songbook-catalogs/${catalog.id}/entries/import`, { content: "Number,Title\n0012,Twelve\n2,Two\n855,Eight five five\n" });
const before = await api(admin, "POST", "/songbooks/import-from-catalog", { catalogId: catalog.id });

r = await call(admin, "PATCH", `/songbook-catalogs/${catalog.id}`, { sections: [{ label: "V1", start: 1, end: 10 }, { label: "V2", start: 5, end: 20 }] });
check("overlapping volumes are refused", r.status === 400, String(r.status));
// As {label, start, end}, whatever order the database gives the keys.
const same = (a, b) => JSON.stringify((a ?? []).map(({ label, start, end }) => [label, start, end])) === JSON.stringify((b ?? []).map(({ label, start, end }) => [label, start, end]));
const volumes = [
  { label: `V${abbr}1`, start: 1, end: 400 },
  { label: `V${abbr}3`, start: 801, end: 900 },
];
r = await call(admin, "PATCH", `/songbook-catalogs/${catalog.id}`, { sections: volumes });
check("a catalogue's volumes are saved", r.status === 200);
r = await call(admin, "GET", `/songbook-catalogs/${catalog.id}`);
check("and read back, with its entries in order, without leading zeros", same(r.body.sections, volumes) && r.body.entries.map((e) => e.entryCode).join() === "2,12,855", JSON.stringify({ s: r.body.sections, e: r.body.entries.map((e) => e.entryCode) }));

const exported = await (await fetch(`${process.env.E2E_API_URL ?? "http://localhost:3001"}/songbook-catalogs/${catalog.id}/export?format=json`, { headers: { Authorization: `Bearer ${admin.bearer}` } })).json();
check("the JSON file carries them", same(exported.catalog.sections, volumes));
const copy = await call(admin, "POST", "/songbook-catalogs/import", { content: JSON.stringify({ ...exported, catalog: { ...exported.catalog, name: `Volumes copy ${tag}`, abbreviation: `W${abbr}` } }), filename: "copy.json" });
check("and a catalogue made from the file has them", copy.status === 201 && same(copy.body.catalog.sections, volumes), JSON.stringify(copy.body).slice(0, 200));

const after = await api(admin, "POST", "/songbooks/import-from-catalog", { catalogId: catalog.id });
r = await call(admin, "GET", `/songbooks/${after.id}`);
check("a songbook imported from it gets its volumes", same(r.body.sections, volumes) && !r.body.catalogSections);
r = await call(admin, "GET", `/songbooks/${before.id}`);
check("one imported before is offered them, not changed", !r.body.sections && same(r.body.catalogSections, volumes));

finish();
