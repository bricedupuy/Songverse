// The Apple Music API with a MusicKit key (issue #87): saved by an admin
// (the private key checked, kept encrypted, never shown back), tested, and
// then used for Apple Music's matches - the same songs as iTunes Search,
// with their ISRC and writers - signed with a developer token the stand-in
// (lib/fake-providers.mjs) verifies. Without a key, a developer token
// address as a stopgap, its token kept until it expires; without either,
// iTunes Search again.
import { generateKeyPairSync } from "node:crypto";
import { api, call, check, finish, sql, stamp, user } from "../lib/harness.mjs";
import { FAKE_PROVIDERS_URL, appleMusicKey, startFakeProviders } from "../lib/fake-providers.mjs";

const fake = await startFakeProviders();
const admin = await user("Admin");
const someone = await user("Someone");
sql(`update "User" set "isGlobalAdmin"=true where id='${admin.id}'`);
await api(admin, "DELETE", "/admin/metadata/apple-music");
await api(admin, "DELETE", "/admin/metadata");

const keyPair = () => generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const pem = (pair) => pair.privateKey.export({ type: "pkcs8", format: "pem" });
const good = keyPair();
Object.assign(appleMusicKey, { publicKey: good.publicKey, teamId: "TEAM123456", keyId: "KEY1234567" });

let settings = await api(admin, "GET", "/admin/metadata");
check("no key: iTunes Search", settings.appleMusic.source === "none" && !settings.appleMusic.hasDatabasePrivateKey, JSON.stringify(settings.appleMusic));
check("admins only", (await call(someone, "PUT", "/admin/metadata/apple-music", { teamId: "TEAM123456" })).status === 403);
check("nor tested by anyone else", (await call(someone, "POST", "/admin/metadata/apple-music/test")).status === 403);

// --- saving it: checked, encrypted, never shown back
let r = await call(admin, "PUT", "/admin/metadata/apple-music", { teamId: "team", keyId: "KEY1234567", privateKey: pem(good) });
check("a team ID is 10 letters and digits", r.status === 400, `${r.status} ${JSON.stringify(r.body)}`);
r = await call(admin, "PUT", "/admin/metadata/apple-music", { teamId: "TEAM123456", keyId: "KEY1234567", privateKey: "not a key" });
check("a private key must be one", r.status === 400 && /isn't a private key/.test(r.body.message), JSON.stringify(r.body));
const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" });
r = await call(admin, "PUT", "/admin/metadata/apple-music", { teamId: "TEAM123456", keyId: "KEY1234567", privateKey: rsa });
check("a MusicKit one (P-256)", r.status === 400 && /P-256/.test(r.body.message), JSON.stringify(r.body));
r = await call(admin, "PUT", "/admin/metadata/apple-music", { teamId: "TEAM123456", keyId: "KEY1234567", privateKey: pem(good) });
check("saved", r.status === 200 && r.body.appleMusic.source === "database" && r.body.appleMusic.hasDatabasePrivateKey && r.body.appleMusic.keyId === "KEY1234567", JSON.stringify(r.body.appleMusic));
check("the private key never comes back", !JSON.stringify(r.body).includes("PRIVATE KEY") && !JSON.stringify(await api(admin, "GET", "/admin/metadata")).includes("PRIVATE KEY"));
const stored = sql(`select "appleMusicPrivateKeyEnc" from "MetadataSettings" where id='singleton'`);
check("kept encrypted", !!stored && !stored.includes("PRIVATE KEY"));
check("the providers' order is still the default one", (await api(admin, "GET", "/admin/metadata")).source === "default");
r = await call(admin, "POST", "/admin/metadata/apple-music/test");
check("the test connection works", r.status === 201 && r.body.ok === true, JSON.stringify(r.body));

// --- Apple Music's matches through the API
const title = `Oceans ${stamp}`;
const search = async () => (await api(someone, "GET", `/metadata/search?${new URLSearchParams({ title, artist: "Hillsong" })}`)).matches;
let [first] = await search();
check("the ISRC and writers come with Apple Music's match", first.isrc === "USFAK1301000" && first.composers?.join() === "Joel Houston,Matt Crocker,Salomon Ligthelm", JSON.stringify(first));
check("still merged with the others, the same Apple Music ID", first.sources.map((s) => `${s.provider}:${s.provider === "apple_music" ? s.id : ""}`).join() === "musicbrainz:,apple_music:1000,deezer:");
check("its artwork from the API's template", first.artworkUrl?.endsWith("/art/0/800x800bb.png") && first.thumbnailUrl?.endsWith("/art/0/200x200bb.png"), first.artworkUrl);
const song = await api(someone, "POST", "/song-versions", { title, language: "en", artists: ["Hillsong"] });
r = await call(someone, "POST", `/song-versions/${song.id}/metadata-link`, { sources: [{ provider: "apple_music", id: "1000" }] });
check("linked, looked up through the API", r.status === 201 && r.body.isrc === "USFAK1301000" && r.body.composers.length === 3, `${r.status} ${JSON.stringify(r.body)}`);

// --- a partial save keeps the rest; a key Apple refuses
settings = await api(admin, "PUT", "/admin/metadata/apple-music", { keyId: "KEY7654321" });
check("changing the key ID keeps the private key", settings.appleMusic.keyId === "KEY7654321" && settings.appleMusic.teamId === "TEAM123456" && settings.appleMusic.hasDatabasePrivateKey);
r = await call(admin, "POST", "/admin/metadata/apple-music/test");
check("a key Apple refuses: the test says so", r.body.ok === false && /refused/.test(r.body.message), JSON.stringify(r.body));
const { unavailable } = await api(someone, "GET", `/metadata/search?${new URLSearchParams({ title, artist: "Hillsong" })}`);
check("and Apple Music is left out of searches, named", unavailable.join() === "apple_music", JSON.stringify(unavailable));

// --- back to iTunes Search
settings = await api(admin, "DELETE", "/admin/metadata/apple-music");
check("reverted: no key", settings.appleMusic.source === "none" && !settings.appleMusic.hasDatabasePrivateKey && settings.appleMusic.teamId === null);
r = await call(admin, "POST", "/admin/metadata/apple-music/test");
check("nothing to test", r.body.ok === false && /No MusicKit key/.test(r.body.message));
[first] = await search();
check("Apple Music through iTunes Search again: no ISRC", first.sources.some((s) => s.provider === "apple_music") && !first.isrc, JSON.stringify(first));

// --- a developer token address, until there's a key
const minted = keyPair();
Object.assign(appleMusicKey, { publicKey: minted.publicKey, privateKey: minted.privateKey, teamId: "MINT123456", keyId: "MINTKEY123", tokenHits: 0 });
r = await call(admin, "PUT", "/admin/metadata/apple-music", { tokenUrl: "ftp://example.com/token" });
check("a token address is https", r.status === 400, String(r.status));
settings = await api(admin, "PUT", "/admin/metadata/apple-music", { tokenUrl: `${FAKE_PROVIDERS_URL}/applemusic-token` });
check("saved: tokens from it", settings.appleMusic.source === "tokenUrl" && settings.appleMusic.tokenUrlSource === "database" && settings.appleMusic.tokenUrl.endsWith("/applemusic-token"), JSON.stringify(settings.appleMusic));
r = await call(admin, "POST", "/admin/metadata/apple-music/test");
check("the test connection works with its token", r.body.ok === true, JSON.stringify(r.body));
[first] = await search();
await search();
check("Apple Music through the API again, with its ISRC", first.isrc === "USFAK1301000", JSON.stringify(first));
check("one token for all of it, kept until it expires", appleMusicKey.tokenHits === 1, String(appleMusicKey.tokenHits));
// The address's key changes: the kept token is refused, a new one fetched once.
const rotated = keyPair();
Object.assign(appleMusicKey, { publicKey: rotated.publicKey, privateKey: rotated.privateKey });
[first] = await search();
check("a refused token is fetched again", first.isrc === "USFAK1301000" && appleMusicKey.tokenHits === 2, `${appleMusicKey.tokenHits} ${JSON.stringify(first)}`);
settings = await api(admin, "PUT", "/admin/metadata/apple-music", { teamId: "TEAM123456", keyId: "KEY1234567", privateKey: pem(good) });
check("a key, once saved, is used instead", settings.appleMusic.source === "database" && settings.appleMusic.tokenUrl !== null);
settings = await api(admin, "DELETE", "/admin/metadata/apple-music");
check("reverted: neither", settings.appleMusic.source === "none" && settings.appleMusic.tokenUrl === null);

fake.close();
finish();
