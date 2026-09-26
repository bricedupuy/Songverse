// Artists (issue #86): a new song's artist gets a picture from Deezer and
// short bios from Wikipedia (found through MusicBrainz and Wikidata), all
// stand-ins (lib/fake-providers.mjs); shown to whoever can see a song by
// them, matched by name ignoring case and accents; admins upload a picture
// and write a bio, which a new lookup leaves alone; the admin's switch and
// backfill.
import { API, api, call, check, finish, sql, stamp, user } from "../lib/harness.mjs";
import { png, startFakeProviders } from "../lib/fake-providers.mjs";

const fake = await startFakeProviders();
const owner = await user("Owner");
const stranger = await user("Stranger");
const admin = await user("Admin");
sql(`update "User" set "isGlobalAdmin"=true where id='${admin.id}'`);
await api(admin, "DELETE", "/admin/artists");

const band = `Band ${stamp}`;
const detail = (who, name) => call(who, "GET", `/artists/detail?${new URLSearchParams({ name })}`);
async function lookedUp(who, name) {
  for (let i = 0; i < 80; i++) {
    const r = await detail(who, name);
    if (r.status === 200 && r.body.lookedUp) return r.body;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return (await detail(who, name)).body;
}

// --- a new song's artist, looked up on their own
await api(owner, "POST", "/song-versions", { title: `Artist song ${stamp}`, language: "en", artists: [band] });
let artist = await lookedUp(owner, band);
check("looked up on their own", artist?.lookedUp === true, JSON.stringify(artist));
check("a picture, from Deezer", !!artist.imageUrl && artist.imageSource === "deezer" && artist.imageSourceUrl === "https://www.deezer.com/artist/9001", JSON.stringify(artist));
const en = artist.bios.find((b) => b.language === "en");
const fr = artist.bios.find((b) => b.language === "fr");
check("a bio in English and in French, from Wikipedia", en?.text === `${band} is a band.` && fr?.text === `${band} est un groupe.` && en.sourceUrl.startsWith("https://en.wikipedia.org/wiki/") && !en.custom, JSON.stringify(artist.bios));
check("a song by them you can see", artist.songCount === 1 && artist.canEdit === false);
let res = await fetch(`${artist.imageUrl}&w=64`);
check("the picture, served at a signed address", res.status === 200 && res.headers.get("content-type") === "image/webp", String(res.status));
res = await fetch(artist.imageUrl.replace(/signature=[^&]+/, "signature=forged"));
check("not with a forged signature", res.status === 403, String(res.status));
const listed = (await api(owner, "GET", `/song-versions/artists?q=${encodeURIComponent(band)}`))[0];
check("the list of artists has their picture", listed?.imageUrl?.includes(`/artists/${artist.id}/image/`), JSON.stringify(listed));
check("the same artist whatever the case", (await detail(owner, band.toUpperCase())).body?.id === artist.id);
check("someone who can see none of their songs can't see them", (await detail(stranger, band)).status === 404);
check("nor look them up", (await call(stranger, "POST", "/artists/lookup", { name: band })).status === 404);

// --- nothing to find
const shy = `Nopicture Nobio ${stamp}`;
await api(owner, "POST", "/song-versions", { title: `Shy song ${stamp}`, language: "en", artists: [shy] });
artist = await lookedUp(owner, shy);
check("no picture, no bio: their initials", artist.lookedUp && !artist.imageUrl && artist.bios.length === 0, JSON.stringify(artist));

// --- admins edit them
check("only admins upload a picture", (await call(owner, "DELETE", `/artists/picture?${new URLSearchParams({ name: band })}`)).status === 403);
check("or write a bio", (await call(owner, "PUT", "/artists/bio", { name: band, language: "en", text: "Mine" })).status === 403);
check("or look them up again", (await call(owner, "POST", "/artists/lookup", { name: band, force: true })).status === 403);
check("an admin edits only artists they can see a song by", (await call(admin, "PUT", "/artists/bio", { name: band, language: "en", text: "x" })).status === 404);
await api(admin, "POST", "/song-versions", { title: `Admin song ${stamp}`, language: "en", artists: [band] });
const upload = (body, type) => {
  const form = new FormData();
  form.append("file", new Blob([body], { type }), "p.png");
  return fetch(`${API}/artists/picture?${new URLSearchParams({ name: band })}`, { method: "POST", headers: { Authorization: `Bearer ${admin.bearer}` }, body: form });
};
res = await upload(png(10, 200, 90), "image/png");
check("an admin uploads a picture", res.status === 204, String(res.status));
artist = (await detail(admin, band)).body;
check("theirs now", artist.imageSource === "upload" && !!artist.imageUrl && artist.canEdit === true, JSON.stringify(artist));
check("not an SVG", (await upload("<svg/>", "image/svg+xml")).status === 400);
let r = await call(admin, "PUT", "/artists/bio", { name: band, language: "fr", text: "  Un groupe d'ici.  " });
check("an admin writes the French bio", r.status === 204, String(r.status));
check("in another language: no", (await call(admin, "PUT", "/artists/bio", { name: band, language: "de", text: "x" })).status === 400);
r = await call(admin, "POST", "/artists/lookup", { name: band, force: true });
const again = r.body;
check("looked up again: the uploaded picture stays", r.status === 201 && again.imageSource === "upload", `${r.status} ${JSON.stringify(again)}`);
check("and the bio written here", again.bios.find((b) => b.language === "fr")?.text === "Un groupe d'ici." && again.bios.find((b) => b.language === "fr").custom, JSON.stringify(again.bios));
check("the owner sees them too", (await detail(owner, band)).body.bios.some((b) => b.custom));
r = await call(admin, "DELETE", `/artists/picture?${new URLSearchParams({ name: band })}`);
artist = (await detail(admin, band)).body;
check("the picture removed: their initials", r.status === 204 && !artist.imageUrl, JSON.stringify(artist));
await call(admin, "POST", "/artists/lookup", { name: band });
check("not brought back by a lookup", !(await detail(admin, band)).body.imageUrl);
await call(admin, "POST", "/artists/lookup", { name: band, force: true });
check("unless asked to look again", (await detail(admin, band)).body.imageSource === "deezer");
await call(admin, "PUT", "/artists/bio", { name: band, language: "fr", text: "" });
await call(admin, "POST", "/artists/lookup", { name: band, force: true });
check("an emptied bio: Wikipedia's again", (await detail(admin, band)).body.bios.find((b) => b.language === "fr")?.custom === false);

// --- the admin's switch and backfill
check("admins only", (await call(owner, "GET", "/admin/artists")).status === 403);
let settings = await api(admin, "PUT", "/admin/artists", { enabled: false });
check("turned off", settings.enabled === false && settings.source === "database");
const later = `Later ${stamp}`;
await api(owner, "POST", "/song-versions", { title: `Later song ${stamp}`, language: "en", artists: [later] });
await new Promise((resolve) => setTimeout(resolve, 3000));
artist = (await detail(owner, later)).body;
check("off: a new song's artist isn't looked up", artist.lookedUp === false && artist.lookupsEnabled === false, JSON.stringify(artist));
check("nor on their page", (await call(owner, "POST", "/artists/lookup", { name: later })).status === 400);
check("nor by a backfill", (await call(admin, "POST", "/admin/artists/backfill")).status === 404);
settings = await api(admin, "DELETE", "/admin/artists");
check("back to the default: on", settings.enabled === true && settings.source === "default");
r = await call(admin, "POST", "/admin/artists/backfill");
check("the backfill starts, as a background job (issue #92)", r.status === 201 && r.body.queued === true, JSON.stringify(r.body));
check("and looks them up", (await lookedUp(owner, later))?.lookedUp === true);

fake.close();
finish();
