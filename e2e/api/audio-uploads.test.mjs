// Audio uploads above 320 kbps (issue #182): the Worker makes them Opus, a
// new file in their place; below that, they stay as uploaded. Someone with a
// role that keeps lossless originals keeps one, as FLAC - a WAV at its own
// sample rate and bit depth, a FLAC as it was - downloaded beside the Opus
// copy, and counted in their storage.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { API, api, call, check, finish, settledFiles, sql, stamp, user } from "../lib/harness.mjs";

const plain = await user("Plain uploader");
const keeper = await user("Original keeper");
const admin = await user("Audio admin");
sql(`update "User" set "isGlobalAdmin"=true where id='${admin.id}'`);

/** A WAV of a 440 Hz tone (or of noise, which FLAC can't make much smaller): `seconds` long, at `rate`, `bits` 16 or 24, `channels`. */
function wav({ seconds = 3, rate = 44100, bits = 16, channels = 2, noise = false }) {
  const bytes = bits / 8;
  const frames = seconds * rate;
  const data = Buffer.alloc(frames * channels * bytes);
  for (let i = 0; i < frames; i++) {
    const value = Math.round((noise ? Math.random() - 0.5 : Math.sin((2 * Math.PI * 440 * i) / rate)) * 0.5 * (2 ** (bits - 1) - 1));
    for (let c = 0; c < channels; c++) data.writeIntLE(value, (i * channels + c) * bytes, bytes);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * channels * bytes, 28);
  header.writeUInt16LE(channels * bytes, 32);
  header.writeUInt16LE(bits, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

async function upload(who, songId, bytes, name, type) {
  const form = new FormData();
  form.append("type", "AUDIO");
  form.append("file", new Blob([bytes], { type }), name);
  const res = await fetch(`${API}/song-versions/${songId}/attachments`, { method: "POST", headers: { Authorization: `Bearer ${who.bearer}` }, body: form });
  return { status: res.status, body: await res.json().catch(() => null) };
}

/** A FLAC file's STREAMINFO: sample rate, channels, bits per sample. */
function streamInfo(flac) {
  const at = 8 + 10;
  const rate = (flac[at] << 12) | (flac[at + 1] << 4) | (flac[at + 2] >> 4);
  const channels = ((flac[at + 2] >> 1) & 0x7) + 1;
  const bits = (((flac[at + 2] & 0x1) << 4) | (flac[at + 3] >> 4)) + 1;
  return { rate, channels, bits };
}

const song = async (who, title) => api(who, "POST", "/song-versions", { title: `${title} ${stamp}`, language: "en", artists: ["Someone"], content: "[G]Line\n", contentFormat: "CHORDPRO" });

// --- without the role: Opus only
{
  const s = await song(plain, "Heavy");
  const big = wav({});
  let r = await upload(plain, s.id, big, "Live take.wav", "audio/wav");
  check("a 1411 kbps WAV: being made Opus", r.status === 201 && r.body.processing === "PENDING", JSON.stringify(r.body?.processing));
  const [file] = await settledFiles(plain, s.id);
  check(
    "made Opus by the Worker: a new file, its name kept, a fraction of the size, no original kept",
    file && file.id !== r.body.id && file.mimeType === "audio/ogg" && file.filename === "Live take.opus" && file.sizeBytes < big.length / 4 && file.original === null,
    JSON.stringify(file),
  );
  r = await call(plain, "GET", `/song-versions/${s.id}/attachments/${file.id}/original`);
  check("no original to download", r.status === 404, String(r.status));

  const light = wav({ rate: 8000, channels: 1 });
  r = await upload(plain, s.id, light, "Phone memo.wav", "audio/wav");
  check("a 128 kbps WAV: kept as uploaded, nothing to do", r.status === 201 && r.body.processing === null, JSON.stringify(r.body?.processing));
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const memo = (await api(plain, "GET", `/song-versions/${s.id}/attachments`)).find((f) => f.filename === "Phone memo.wav");
  check("still the WAV", memo?.id === r.body.id && memo.mimeType === "audio/wav", JSON.stringify(memo));
}

// --- with the role: the original kept as FLAC
const role = await api(admin, "POST", "/admin/roles", { name: `Lossless ${stamp}`, canKeepLosslessAudio: true });
try {
  const roles = await api(admin, "GET", "/admin/roles");
  check("Admin > Roles says what it allows", roles.find((r) => r.id === role.id)?.canKeepLosslessAudio === true);
  // Beside the role to upload audio files at all (issue #183).
  await api(admin, "PUT", `/admin/users/${keeper.id}/roles`, { roleIds: [role.id, "role_audio_uploads"] });

  const s = await song(keeper, "Kept");
  const master = wav({ rate: 48000, bits: 24 });
  await upload(keeper, s.id, master, "Master.wav", "audio/wav");
  const [file] = await settledFiles(keeper, s.id);
  check("played as Opus, the original kept as FLAC", file?.mimeType === "audio/ogg" && file.original?.mimeType === "audio/flac" && file.original.sizeBytes > 0, JSON.stringify(file));
  const res = await fetch(`${API}/song-versions/${s.id}/attachments/${file.id}/original`, { headers: { Authorization: `Bearer ${keeper.bearer}` } });
  const flac = Buffer.from(await res.arrayBuffer());
  check("downloaded as Master.flac", res.status === 200 && /Master\.flac/.test(res.headers.get("content-disposition") ?? ""), res.headers.get("content-disposition"));
  const info = flac.subarray(0, 4).toString("latin1") === "fLaC" ? streamInfo(flac) : null;
  check("the WAV's sample rate, channels and bit depth: 48 kHz, stereo, 24-bit", info?.rate === 48000 && info.channels === 2 && info.bits === 24, JSON.stringify(info));
  const decoded = execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-f", "s24le", "pipe:1"], { input: flac, maxBuffer: 64 * 1024 * 1024 });
  check("the same samples: lossless", decoded.equals(master.subarray(44)), `${decoded.length} bytes from ${master.length - 44}`);
  const storage = await api(keeper, "GET", "/users/me/storage");
  check("both count in their storage", storage.usedBytes === file.sizeBytes + file.original.sizeBytes, JSON.stringify([storage.usedBytes, file.sizeBytes, file.original.sizeBytes]));
  const other = await user("Not the keeper");
  const r = await call(other, "GET", `/song-versions/${s.id}/attachments/${file.id}/original`);
  check("someone who can't see the file can't download its original", r.status === 403 || r.status === 404, String(r.status));

  // A FLAC uploaded (of noise: a tone would be under 320 kbps even so): kept as it is, its bytes the same.
  const flacUpload = execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "wav", "-i", "pipe:0", "-c:a", "flac", "-f", "flac", "pipe:1"], { input: wav({ noise: true }) });
  const s2 = await song(admin, "Flac");
  await upload(admin, s2.id, flacUpload, "Studio.flac", "audio/flac");
  const [studio] = await settledFiles(admin, s2.id);
  const kept = Buffer.from(await (await fetch(`${API}/song-versions/${s2.id}/attachments/${studio.id}/original`, { headers: { Authorization: `Bearer ${admin.bearer}` } })).arrayBuffer());
  const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
  check("a global admin keeps them too; a FLAC kept byte for byte", studio?.mimeType === "audio/ogg" && sha(kept) === sha(flacUpload), JSON.stringify(studio));
} finally {
  await call(admin, "DELETE", `/admin/roles/${role.id}`);
}

finish();
