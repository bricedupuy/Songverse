// Files streamed, not loaded whole (issue #33): byte ranges, caching, and
// short-lived signed links an <audio src> can use without the Bearer token.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { API, WEB, api, call, check, finish, stamp, user } from "../lib/harness.mjs";

const bytes = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures/stems/03 drums.mp3"));
const size = bytes.length;
const me = await user("Streamer");
const stranger = await user("Stranger");
const song = await api(me, "POST", "/song-versions", { title: `Streamed ${stamp}`, language: "en", artists: ["Someone"], content: "[G]Hi\n", contentFormat: "CHORDPRO" });
const upload = async () => {
  const form = new FormData();
  form.append("type", "AUDIO");
  form.append("file", new Blob([bytes], { type: "audio/mpeg" }), "drums.mp3");
  const res = await fetch(`${API}/song-versions/${song.id}/attachments`, { method: "POST", headers: { Authorization: `Bearer ${me.bearer}` }, body: form });
  return res.json();
};
const file = await upload();
const download = `${API}/song-versions/${song.id}/attachments/${file.id}/download`;
const get = (url, headers = {}, who = me) => fetch(url, { headers: { ...(who && { Authorization: `Bearer ${who.bearer}` }), ...headers } });
const same = async (res, from, to) => Buffer.from(await res.arrayBuffer()).equals(bytes.subarray(from, to));

// --- the download route
let res = await get(download);
check(
  "the whole file, with its size, that it takes ranges, and cached for good",
  res.status === 200 &&
    res.headers.get("content-length") === String(size) &&
    res.headers.get("accept-ranges") === "bytes" &&
    res.headers.get("cache-control")?.includes("immutable") &&
    res.headers.get("content-disposition")?.startsWith("attachment") &&
    (await same(res, 0, size)),
  `${res.status} ${[...res.headers].join(" ")}`,
);
const etag = res.headers.get("etag");
res = await get(download, { Range: "bytes=0-99" });
check("the first 100 bytes", res.status === 206 && res.headers.get("content-range") === `bytes 0-99/${size}` && res.headers.get("content-length") === "100" && (await same(res, 0, 100)), `${res.status} ${res.headers.get("content-range")}`);
res = await get(download, { Range: `bytes=${size - 10}-` });
check("from a byte to the end", res.status === 206 && (await same(res, size - 10, size)));
res = await get(download, { Range: "bytes=-10" });
check("the last 10 bytes", res.status === 206 && res.headers.get("content-range") === `bytes ${size - 10}-${size - 1}/${size}` && (await same(res, size - 10, size)));
res = await get(download, { Range: `bytes=${size}-` });
check("a range past the end is refused", res.status === 416 && res.headers.get("content-range") === `bytes */${size}`, String(res.status));
res = await get(download, { "If-None-Match": etag });
check("unchanged since the copy the browser has", res.status === 304, String(res.status));
res = await get(download, {}, stranger);
check("someone who can't see the song can't download it", res.status === 403 || res.status === 404, String(res.status));

// --- signed links
let r = await call(me, "POST", `/song-versions/${song.id}/attachments/${file.id}/link`);
check("a link to the file, for an hour", r.status === 200 && r.body.path.startsWith(`/files/${file.id}?`) && Math.abs(new Date(r.body.expiresAt) - Date.now() - 3600_000) < 60_000, JSON.stringify(r.body));
const link = `${API}${r.body.path}`;
res = await get(link, {}, null);
check("it works without signing in, shown in place", res.status === 200 && res.headers.get("content-disposition")?.startsWith("inline") && (await same(res, 0, size)), String(res.status));
check("in a sandbox, whatever it is", res.headers.get("content-security-policy") === "sandbox" && res.headers.get("x-content-type-options") === "nosniff", String(res.headers.get("content-security-policy")));
res = await get(link, { Range: "bytes=100-199" }, null);
check("and streams by ranges", res.status === 206 && (await same(res, 100, 200)), String(res.status));
const url = new URL(link);
url.searchParams.set("expires", String(Number(url.searchParams.get("expires")) + 3600_000));
res = await get(url.toString(), {}, null);
check("a link given longer to live doesn't work", res.status === 403, String(res.status));
url.searchParams.set("expires", "1000");
res = await get(url.toString(), {}, null);
check("nor an expired one", res.status === 403, String(res.status));
res = await get(`${API}/files/${file.id}`, {}, null);
check("nor none at all", res.status === 403, String(res.status));
const other = await upload();
res = await get(`${API}/files/${other.id}${url.search.replace(/expires=\d+/, `expires=${new URL(link).searchParams.get("expires")}`)}`, {}, null);
check("nor one for another file", res.status === 403, String(res.status));
r = await call(stranger, "POST", `/song-versions/${song.id}/attachments/${file.id}/link`);
check("someone who can't see the song gets no link", r.status === 403 || r.status === 404, String(r.status));
await call(me, "DELETE", `/song-versions/${song.id}/attachments/${file.id}`);
res = await get(link, {}, null);
check("a deleted file's link stops working", res.status === 403, String(res.status));

// --- a file that would run in the browser (issue #112): only ever downloaded
const page = await (async () => {
  const form = new FormData();
  form.append("type", "OTHER");
  form.append("file", new Blob(["<script>alert(document.cookie)</script>"], { type: "text/html" }), "page.html");
  return (await fetch(`${API}/song-versions/${song.id}/attachments`, { method: "POST", headers: { Authorization: `Bearer ${me.bearer}` }, body: form })).json();
})();
res = await get(`${API}/song-versions/${song.id}/attachments/${page.id}/download`);
check(
  "an HTML file is downloaded as bytes, never shown",
  res.status === 200 && res.headers.get("content-type") === "application/octet-stream" && res.headers.get("content-disposition")?.startsWith("attachment") && res.headers.get("content-security-policy") === "sandbox",
  `${res.headers.get("content-type")} ${res.headers.get("content-disposition")}`,
);
r = await call(me, "POST", `/song-versions/${song.id}/attachments/${page.id}/link`);
check("and gets no link that opens without signing in", r.status === 400, String(r.status));

// --- compression (issue #120): text compressed, files left as they are
const raw = (url, headers) => new Promise((resolve, reject) => {
  // node:http, which (unlike fetch) doesn't decompress: what goes over the wire.
  import("node:http").then(({ get }) => get(url, { headers }, (r) => { const chunks = []; r.on("data", (c) => chunks.push(c)); r.on("end", () => resolve({ status: r.statusCode, headers: r.headers, size: Buffer.concat(chunks).length })); }).on("error", reject));
});
let wire = await raw(`${API}/api/docs-json`, { "Accept-Encoding": "br" });
const plain = await raw(`${API}/api/docs-json`, {});
check("the API's JSON is compressed for a client that takes it", wire.headers["content-encoding"] === "br" && wire.size * 3 < plain.size && !plain.headers["content-encoding"], `${wire.headers["content-encoding"]} ${wire.size} vs ${plain.size}`);
const other2 = await upload();
wire = await raw(`${API}/song-versions/${song.id}/attachments/${other2.id}/download`, { "Accept-Encoding": "br, gzip", Authorization: `Bearer ${me.bearer}`, Range: "bytes=0-99" });
check("a file isn't: its byte ranges still work", wire.status === 206 && !wire.headers["content-encoding"] && wire.size === 100, `${wire.status} ${wire.headers["content-encoding"]} ${wire.size}`);
const resetPage = await (await fetch(`${WEB}/reset-password`)).text();
const asset = resetPage.match(/\/assets\/[^"']+\.js/)?.[0];
wire = asset ? await raw(`${WEB}${asset}`, { "Accept-Encoding": "gzip" }) : null;
check("the web app's code is compressed too", wire?.headers["content-encoding"] === "gzip" && wire.headers.vary?.includes("Accept-Encoding"), `${asset} ${JSON.stringify(wire?.headers)}`);

// --- security headers (issue #112)
res = await fetch(`${API}/song-versions`);
check(
  "the API says not to guess types, frame it or send the referrer",
  res.headers.get("x-content-type-options") === "nosniff" && res.headers.get("x-frame-options") === "DENY" && res.headers.get("referrer-policy") === "no-referrer" && !res.headers.get("x-powered-by"),
  [...res.headers].join(" "),
);
res = await fetch(`${WEB}/login`);
check(
  "the web app too",
  res.headers.get("x-content-type-options") === "nosniff" && res.headers.get("x-frame-options") === "SAMEORIGIN" && res.headers.get("referrer-policy") === "strict-origin-when-cross-origin",
  [...res.headers].join(" "),
);

finish();
