// Spotify and what each provider is asked for (issue #89): Spotify's app
// (client ID and secret, encrypted, never shown back; tested) against a
// stand-in (lib/fake-providers.mjs); its matches in Auto detect, its
// streaming link; per provider, song info, album artwork, artist pictures
// and artist bios turned on or off, in the admin's order.
import { api, call, check, finish, sql, stamp, user } from "../lib/harness.mjs";
import { FAKE_PROVIDERS_URL, spotifyApp, startFakeProviders } from "../lib/fake-providers.mjs";

const fake = await startFakeProviders();
const owner = await user("Listener");
const admin = await user("Admin");
sql(`update "User" set "isGlobalAdmin"=true where id='${admin.id}'`);
await api(admin, "DELETE", "/admin/metadata/spotify");
await api(admin, "DELETE", "/admin/metadata");
await api(admin, "DELETE", "/admin/artists");
Object.assign(spotifyApp, { clientId: "abcdef0123456789abcdef0123456789", clientSecret: "s3cr3t-spotify", tokenHits: 0 });

const spotify = (settings) => settings.providers.find((p) => p.key === "spotify");
let settings = await api(admin, "GET", "/admin/metadata");
check("Spotify: no app yet", settings.spotify.source === "none" && spotify(settings).supports.join() === "songInfo,artwork,artistPictures" && !spotify(settings).ready.songInfo, JSON.stringify(spotify(settings)));
check("admins only", (await call(owner, "PUT", "/admin/metadata/spotify", { clientId: "x" })).status === 403);

// --- its app: checked, encrypted, never shown back
check("a client ID is letters and digits", (await call(admin, "PUT", "/admin/metadata/spotify", { clientId: "not an id!" })).status === 400);
check("a market is two letters", (await call(admin, "PUT", "/admin/metadata/spotify", { market: "USA" })).status === 400);
settings = await api(admin, "PUT", "/admin/metadata/spotify", { clientId: spotifyApp.clientId, clientSecret: spotifyApp.clientSecret, market: "fr" });
check("saved", settings.spotify.source === "database" && settings.spotify.hasDatabaseSecret && settings.spotify.market === "FR" && spotify(settings).ready.songInfo, JSON.stringify(settings.spotify));
check("the secret never comes back", !JSON.stringify(settings).includes(spotifyApp.clientSecret));
check("kept encrypted", !sql(`select "spotifyClientSecretEnc" from "MetadataSettings" where id='singleton'`).includes(spotifyApp.clientSecret));
let r = await call(admin, "POST", "/admin/metadata/spotify/test");
check("the test connection works", r.body.ok === true, JSON.stringify(r.body));

// --- its matches
const title = `Oceans ${stamp}`;
const search = async (t = title) => (await api(owner, "GET", `/metadata/search?${new URLSearchParams({ title: t, artist: "Hillsong" })}`)).matches;
let [first] = await search();
check("the same release from the four providers is one match", first.sources.map((s) => s.provider).join() === "musicbrainz,apple_music,deezer,spotify", JSON.stringify(first.sources));
check("with Spotify's ISRC", first.isrc === "USSPOT1300001", JSON.stringify(first));
check("one app token for all of it", spotifyApp.tokenHits === 1, String(spotifyApp.tokenHits));
const song = await api(owner, "POST", "/song-versions", { title, language: "en", artists: ["Hillsong"] });
r = await call(owner, "POST", `/song-versions/${song.id}/metadata-link`, { sources: [{ provider: "spotify", id: "sp1track0000000000001" }] });
const detail = await api(owner, "GET", `/song-versions/${song.id}`);
check("linked: its Spotify link", r.status === 201 && detail.identifiers.find((i) => i.type === "SPOTIFY")?.value === "sp1track0000000000001", JSON.stringify(detail.identifiers));

// --- what each is asked for
const capabilities = (key, flags) => ({ key, songInfo: false, artwork: false, artistPictures: false, artistBios: false, ...flags });
settings = await api(admin, "PUT", "/admin/metadata", {
  providers: [
    capabilities("spotify", { songInfo: true, artwork: true, artistPictures: true }),
    capabilities("musicbrainz", { songInfo: true }),
    capabilities("apple_music", { songInfo: true }),
    capabilities("deezer", {}),
  ],
});
check("saved per provider", spotify(settings).capabilities.artwork === true && settings.providers.find((p) => p.key === "musicbrainz").capabilities.artistBios === false, JSON.stringify(settings.providers));
check("only what a provider can do", (await api(admin, "PUT", "/admin/metadata", { providers: [capabilities("musicbrainz", { artwork: true })] })).providers[0].capabilities.artwork === false);
await api(admin, "PUT", "/admin/metadata", {
  providers: [
    capabilities("spotify", { songInfo: true, artwork: true, artistPictures: true }),
    capabilities("musicbrainz", { songInfo: true }),
    capabilities("apple_music", { songInfo: true }),
    capabilities("deezer", {}),
  ],
});
[first] = await search();
check("Deezer not asked for song info", !first.sources.some((s) => s.provider === "deezer"), JSON.stringify(first.sources));
check("the artwork only from a provider asked for it: Spotify's", first.artworkUrl === `${FAKE_PROVIDERS_URL}/art/2/640x640.png`, first.artworkUrl);
const candidates = await api(owner, "GET", `/song-versions/${song.id}/artwork/candidates`);
check("Find artwork: only Spotify's", candidates.length > 0 && candidates.every((c) => c.provider === "spotify"), JSON.stringify(candidates.map((c) => c.provider)));
const fresh = await api(owner, "POST", "/song-versions", { title: `Fresh ${stamp}`, language: "en", artists: ["Hillsong"] });
let source = "";
for (let i = 0; i < 40 && !source; i++) {
  source = sql(`select coalesce("imageSourceUrl", '') from "SongVersion" where id='${fresh.id}'`);
  if (!source) await new Promise((resolve) => setTimeout(resolve, 250));
}
check("a new song's artwork from Spotify, its first release", source === `${FAKE_PROVIDERS_URL}/art/2/640x640.png`, source);

// Artist pictures from Spotify, no bios.
const singer = `Singer ${stamp}`;
await api(owner, "POST", "/song-versions", { title: `Sung ${stamp}`, language: "en", artists: [singer] });
let artist;
for (let i = 0; i < 60; i++) {
  artist = await api(owner, "GET", `/artists/detail?${new URLSearchParams({ name: singer })}`);
  if (artist.lookedUp) break;
  await new Promise((resolve) => setTimeout(resolve, 250));
}
check("an artist's picture from Spotify", artist.imageSource === "spotify" && artist.imageSourceUrl === "https://open.spotify.com/artist/spartist1", JSON.stringify(artist));
check("no bio: MusicBrainz isn't asked for them", artist.bios.length === 0);

// --- a wrong secret; no app
// (A token already given lasts its hour: a wrong secret saved here is what's refused.)
await api(admin, "PUT", "/admin/metadata/spotify", { clientSecret: "wrong-secret" });
r = await call(admin, "POST", "/admin/metadata/spotify/test");
check("a secret Spotify refuses: the test says so", r.body.ok === false && /refused/.test(r.body.message), JSON.stringify(r.body));
settings = await api(admin, "DELETE", "/admin/metadata/spotify");
check("reverted: no app", settings.spotify.source === "none" && !settings.spotify.hasDatabaseSecret && !spotify(settings).ready.songInfo);
[first] = await search(`Later ${stamp}`);
check("then not asked", !first?.sources.some((s) => s.provider === "spotify"), JSON.stringify(first));
await api(admin, "DELETE", "/admin/metadata");

fake.close();
finish();
