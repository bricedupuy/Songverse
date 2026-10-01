// A song's links searched for at one service (issue #169): Apple Music and
// Deezer always, Spotify with its app, YouTube with its API key (Admin >
// Metadata: encrypted, never shown back, tested) - against the suites'
// stand-ins (lib/fake-providers.mjs).
import { api, call, check, finish, sql, stamp, user } from "../lib/harness.mjs";
import { spotifyApp, startFakeProviders, youtubeKey } from "../lib/fake-providers.mjs";

const fake = await startFakeProviders();
const owner = await user("Link seeker");
const admin = await user("Link admin");
sql(`update "User" set "isGlobalAdmin"=true where id='${admin.id}'`);
await api(admin, "DELETE", "/admin/metadata/spotify");
await api(admin, "DELETE", "/admin/metadata/youtube");
Object.assign(youtubeKey, { key: "AIzaFakeYouTubeKey0123456789abcdefghijk", searches: 0 });
Object.assign(spotifyApp, { clientId: "abcdef0123456789abcdef0123456789", clientSecret: "s3cr3t-spotify", tokenHits: 0 });

const title = `Oceans ${stamp}`;
const search = (type, t = title) => call(owner, "GET", `/metadata/links/${type}/search?${new URLSearchParams({ title: t, artist: "Hillsong" })}`);

let services = await api(owner, "GET", "/metadata/links");
check("without Spotify's app or a YouTube key: Apple Music and Deezer only", services.APPLE_MUSIC && services.DEEZER && !services.SPOTIFY && !services.YOUTUBE, JSON.stringify(services));
let r = await search("YOUTUBE");
check("YouTube without a key says so", r.status === 503 && /YouTube isn't set up/.test(r.body.message), JSON.stringify(r.body));
r = await search("NAPSTER");
check("an unknown service is refused", r.status === 400, String(r.status));

r = await search("APPLE_MUSIC");
check("Apple Music: a few songs, with their links", r.status === 200 && r.body.length > 0 && r.body.every((c) => c.title && /^https:\/\/music\.apple\.com\//.test(c.url)), JSON.stringify(r.body).slice(0, 300));
r = await search("DEEZER");
check("Deezer too", r.status === 200 && r.body.length > 0 && r.body.every((c) => /deezer\.com\/track\//.test(c.url)), JSON.stringify(r.body).slice(0, 300));

// --- Spotify with its app
await api(admin, "PUT", "/admin/metadata/spotify", { clientId: spotifyApp.clientId, clientSecret: spotifyApp.clientSecret });
r = await search("SPOTIFY");
check("Spotify, once its app is set", r.status === 200 && r.body[0]?.url === "https://open.spotify.com/track/sp1track0000000000001" && r.body[0].album === "Album 1", JSON.stringify(r.body).slice(0, 300));

// --- YouTube's key, in Admin > Metadata
check("only admins set it", (await call(owner, "PUT", "/admin/metadata/youtube", { apiKey: youtubeKey.key })).status === 403);
check("a key is letters and digits", (await call(admin, "PUT", "/admin/metadata/youtube", { apiKey: "not a key!" })).status === 400);
let settings = await api(admin, "PUT", "/admin/metadata/youtube", { apiKey: youtubeKey.key });
check("saved", settings.youtube.source === "database" && settings.youtube.hasDatabaseKey, JSON.stringify(settings.youtube));
check("never shown back", !JSON.stringify(settings).includes(youtubeKey.key));
check("kept encrypted", !sql(`select "youtubeApiKeyEnc" from "MetadataSettings" where id='singleton'`).includes(youtubeKey.key));
r = await call(admin, "POST", "/admin/metadata/youtube/test");
check("its test works", r.body.ok === true, JSON.stringify(r.body));
services = await api(owner, "GET", "/metadata/links");
check("now every service can be searched", Object.values(services).every(Boolean), JSON.stringify(services));

r = await search("YOUTUBE");
check(
  "YouTube: videos, their titles unescaped, the channel, a thumbnail",
  r.status === 200 && r.body.length === 2 && r.body[0].url === "https://www.youtube.com/watch?v=ytvideo0001" && r.body[0].title.includes("& Lyrics") && r.body[0].artist === "Channel 1" && !!r.body[0].thumbnailUrl,
  JSON.stringify(r.body).slice(0, 400),
);
r = await search("YOUTUBE", `quotagone ${stamp}`);
check("its quota used up: said so", r.status === 503 && /quota/i.test(r.body.message), JSON.stringify(r.body));
r = await search("YOUTUBE", `nomatch ${stamp}`);
check("nothing found: an empty list", r.status === 200 && r.body.length === 0, JSON.stringify(r.body));

// A pick becomes the song's link.
const song = await api(owner, "POST", "/song-versions", { title, language: "en", artists: ["Hillsong"] });
r = await call(owner, "PUT", `/song-versions/${song.id}/links/YOUTUBE`, { url: "https://www.youtube.com/watch?v=ytvideo0001" });
check("a result saved as the song's link", r.status === 200 && r.body.value === "ytvideo0001", JSON.stringify(r.body));

// --- a wrong key, then back to the environment (none here)
youtubeKey.key = "AIzaAnotherKey0123456789abcdefghijklmno";
r = await call(admin, "POST", "/admin/metadata/youtube/test");
check("a refused key fails its test, saying so", r.body.ok === false && /refused the API key/.test(r.body.message), JSON.stringify(r.body));
settings = await api(admin, "DELETE", "/admin/metadata/youtube");
check("reverted: no key", settings.youtube.source === "none" && !settings.youtube.hasDatabaseKey, JSON.stringify(settings.youtube));

await api(admin, "DELETE", "/admin/metadata/spotify");
fake.close();
finish();
