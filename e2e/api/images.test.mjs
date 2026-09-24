// API-level checks for avatar normalization and dynamic image resizing.
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { API, ORIGIN, LOG, stamp, tag, check, finish } from "../lib/harness.mjs";


async function signUpAndToken(tag) {
  const email = `um-img-${tag}-${stamp}@example.com`;
  const offset = readFileSync(LOG, "utf8").length;
  await fetch(`${API}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ email, password: "hunter2pass", name: `Img ${tag}` }),
  });
  let link;
  for (let i = 0; i < 30 && !link; i++) {
    await new Promise((r) => setTimeout(r, 300));
    link = readFileSync(LOG, "utf8").slice(offset).match(/https?:\/\/[^\s]+?\/api\/auth\/verify-email\?token=[^\s&]+/)?.[0];
  }
  await fetch(link, { redirect: "manual" });
  const res = await fetch(`${API}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ email, password: "hunter2pass" }),
  });
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const bearer = (await (await fetch(`${API}/api/auth/token`, { headers: { cookie, Origin: ORIGIN } })).json()).token;
  return { email, bearer };
}

const call = (bearer, method, path, body) =>
  fetch(`${API}${path}`, { method, headers: bearer ? { Authorization: `Bearer ${bearer}` } : {}, body });
const upload = (bearer, path, method, buffer, name, extra = {}) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  form.append("file", new Blob([buffer]), name);
  return call(bearer, method, path, form);
};
const meta = async (res) => sharp(Buffer.from(await res.arrayBuffer())).metadata();

const alice = await signUpAndToken("alice");
const bob = await signUpAndToken("bob");

// A landscape 1200x800 JPEG whose EXIF says "rotate 90°" (so it's upright as 800x1200) and carries GPS data.
const rotatedPhoto = await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#cc3366" } })
  .jpeg()
  .withMetadata({ orientation: 6, exif: { IFD0: { Make: "TestCam" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "48/1 51/1 0/1" } } })
  .toBuffer();
const fixtureMeta = await sharp(rotatedPhoto).metadata();
check("test photo has EXIF orientation 6 and an EXIF block", fixtureMeta.orientation === 6 && (fixtureMeta.exif?.length ?? 0) > 0, `${fixtureMeta.exif?.length} bytes`);

let res = await upload(alice.bearer, "/users/me/avatar", "PUT", rotatedPhoto, "photo.jpg");
const me = await res.json();
check("large rotated photo accepted as avatar", res.status === 200 && !!me.avatarUrl, String(res.status));
res = await fetch(me.avatarUrl);
let m = await meta(res);
check("stored avatar is a 512x512 WebP", m.format === "webp" && m.width === 512 && m.height === 512, `${m.format} ${m.width}x${m.height}`);
check("EXIF (incl. GPS) stripped", !m.exif && !m.orientation, JSON.stringify({ exif: !!m.exif, orientation: m.orientation }));

const small = await sharp({ create: { width: 300, height: 200, channels: 3, background: "#33cc66" } }).png().toBuffer();
res = await upload(alice.bearer, "/users/me/avatar", "PUT", small, "small.png");
m = await meta(await fetch((await res.json()).avatarUrl));
check("small non-square image center-cropped, not enlarged", m.width === 200 && m.height === 200, `${m.width}x${m.height}`);

res = await upload(alice.bearer, "/users/me/avatar", "PUT", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'), "x.svg");
check("SVG avatar rejected", res.status === 415, String(res.status));
res = await upload(alice.bearer, "/users/me/avatar", "PUT", Buffer.from("not an image at all"), "x.png");
check("garbage avatar rejected", res.status === 415, String(res.status));

res = await upload(alice.bearer, "/users/me/avatar", "PUT", rotatedPhoto, "photo.jpg");
const avatarUrl = (await res.json()).avatarUrl;
res = await fetch(`${avatarUrl}?size=64`);
m = await meta(res);
check("?size=64 gives a 64px WebP", res.headers.get("content-type") === "image/webp" && m.width === 64 && m.height === 64, `${m.width}x${m.height}`);
check("sized avatar is publicly cacheable", res.headers.get("cache-control") === "public, max-age=31536000, immutable");
m = await meta(await fetch(`${avatarUrl}?size=50`));
check("?size=50 snaps up to 64", m.width === 64, String(m.width));
m = await meta(await fetch(`${avatarUrl}?size=4000`));
check("?size=4000 never enlarges past the 512 source", m.width === 512, String(m.width));
res = await fetch(`${avatarUrl}?size=0`);
check("?size=0 rejected", res.status === 400, String(res.status));
res = await fetch(`${avatarUrl}?size=abc`);
check("?size=abc rejected", res.status === 400, String(res.status));

// Attachments
const song = await (await fetch(`${API}/song-versions`, {
  method: "POST",
  headers: { Authorization: `Bearer ${alice.bearer}`, "Content-Type": "application/json" },
  body: JSON.stringify({ title: `Img Song ${stamp}`, language: "en", artists: ["Test Artist"] }),
})).json();
const bigScan = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#224488" } }).png().toBuffer();
res = await upload(alice.bearer, `/song-versions/${song.id}/attachments`, "POST", bigScan, "scan.png", { type: "IMAGE" });
const imageAttachment = await res.json();
res = await upload(alice.bearer, `/song-versions/${song.id}/attachments`, "POST", Buffer.from("%PDF-1.4 fake"), "sheet.pdf", { type: "PDF" });
const pdfAttachment = await res.json();

const imagePath = `/song-versions/${song.id}/attachments/${imageAttachment.id}/image`;
let t0 = Date.now();
res = await call(alice.bearer, "GET", `${imagePath}?w=256`);
const firstMs = Date.now() - t0;
m = await meta(res);
check("image attachment resized to 256 wide (aspect kept)", m.format === "webp" && m.width === 256 && m.height === 171, `${m.width}x${m.height}`);
check("attachment rendition is private-cacheable", res.headers.get("cache-control")?.startsWith("private"), res.headers.get("cache-control"));
t0 = Date.now();
await (await call(alice.bearer, "GET", `${imagePath}?w=256`)).arrayBuffer();
const secondMs = Date.now() - t0;
check("second request served from cache (faster)", secondMs < firstMs, `${firstMs}ms -> ${secondMs}ms`);
res = await call(null, "GET", `${imagePath}?w=256`);
check("signed-out request rejected", res.status === 401, String(res.status));
res = await call(bob.bearer, "GET", `${imagePath}?w=256`);
check("another user's private song rejected", res.status === 403 || res.status === 404, String(res.status));
res = await call(alice.bearer, "GET", imagePath);
check("missing width rejected", res.status === 400, String(res.status));
res = await upload(alice.bearer, `/song-versions/${song.id}/attachments`, "POST", rotatedPhoto, "phone.jpg", { type: "IMAGE" });
const rotatedAttachment = await res.json();
m = await meta(await call(alice.bearer, "GET", `/song-versions/${song.id}/attachments/${rotatedAttachment.id}/image?w=256`));
check("EXIF rotation applied (1200x800 landscape tagged 90° comes out portrait)", m.width === 256 && m.height === 384 && !m.orientation, `${m.width}x${m.height}`);

res = await call(alice.bearer, "GET", `/song-versions/${song.id}/attachments/${pdfAttachment.id}/image?w=256`);
check("non-image attachment rejected", res.status === 415, String(res.status));

finish();
