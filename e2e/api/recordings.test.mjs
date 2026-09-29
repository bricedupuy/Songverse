// Recorded takes, processed by the Worker (issue #127): the browser's WAV
// turned into Opus - a fraction of the size, the silence after the end
// trimmed, the level evened out and the noise reduced if asked - with its
// start exactly where it was, since that's what lines it up with the other
// parts. Also: other takes of a part, and a multitrack recorded for a set.
import { execFileSync } from "node:child_process";
import { API, api, call, check, finish, stamp, user } from "../lib/harness.mjs";

const me = await user("Take maker");
const other = await user("Someone else");
const song = await api(me, "POST", "/song-versions", { title: `Takes ${stamp}`, language: "en", artists: ["Someone"], content: "[G]Takes\n", contentFormat: "CHORDPRO", tempo: 120 });
const files = () => api(me, "GET", `/song-versions/${song.id}/attachments`);

/** A take: quiet hiss, a click at 1.000 s, then a tone, then 2 s of silence - mono 16-bit WAV at 48 kHz. */
function takeWav() {
  const rate = 48000;
  const samples = new Int16Array(rate * 5);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.round((Math.random() - 0.5) * 200);
  for (let i = 0; i < 480; i++) samples[rate + i] = Math.round(20000 * Math.sin((2 * Math.PI * 1000 * i) / rate));
  for (let i = Math.round(1.5 * rate); i < 3 * rate; i++) samples[i] = Math.round(6000 * Math.sin((2 * Math.PI * 440 * i) / rate));
  for (let i = 3 * rate; i < samples.length; i++) samples[i] = 0;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + samples.length * 2, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(samples.length * 2, 40);
  return Buffer.concat([header, Buffer.from(samples.buffer)]);
}

async function upload(fields, who = me, bytes = takeWav(), name = "Takes - Guitar.wav", type = "audio/wav") {
  const form = new FormData();
  form.append("type", "AUDIO");
  for (const [key, value] of Object.entries(fields)) form.append(key, String(value));
  form.append("file", new Blob([bytes], { type }), name);
  const res = await fetch(`${API}/song-versions/${song.id}/attachments`, { method: "POST", headers: { Authorization: `Bearer ${who.bearer}` }, body: form });
  return { status: res.status, body: await res.json().catch(() => null) };
}

/** Waits for the Worker to replace the take: the processed file of that part and multitrack. */
async function processed(match) {
  for (let i = 0; i < 150; i++) {
    const found = (await files()).find((file) => match(file) && file.processing !== "PENDING");
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return null;
}

/** When the click sounds in a file (s), decoded by ffmpeg. */
async function clickAt(file) {
  const res = await fetch(`${API}/song-versions/${song.id}/attachments/${file.id}/download`, { headers: { Authorization: `Bearer ${me.bearer}` } });
  const pcm = execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-f", "s16le", "-ac", "1", "-ar", "48000", "pipe:1"], { input: Buffer.from(await res.arrayBuffer()) });
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length / 2);
  let peak = 0;
  for (let i = 0; i < 96000; i++) peak = Math.max(peak, Math.abs(samples[i]));
  return { at: samples.findIndex((value) => Math.abs(value) > peak * 0.3) / 48000, seconds: samples.length / 48000 };
}

// --- processing
let r = await upload({ stemPart: "GUITAR", multitrackId: "mtrecordings01", recordingTempo: 120, recordingFirstBeat: 1, process: "encode,level" });
check("a take to process: kept as sent for now, PENDING", r.status === 201 && r.body.processing === "PENDING" && r.body.mimeType === "audio/wav", JSON.stringify(r.body));
const wavSize = r.body.sizeBytes;
let guitar = await processed((file) => file.multitrackId === "mtrecordings01" && file.stemPart === "GUITAR");
check(
  "the Worker replaced it with Opus: a new file, the same part, multitrack and details",
  guitar && guitar.id !== r.body.id && guitar.mimeType === "audio/ogg" && guitar.filename === "Takes - Guitar.opus" && guitar.processing === null && guitar.recordingTempo === 120 && guitar.recordingFirstBeat === 1 && guitar.visibility === "PRIVATE",
  JSON.stringify(guitar),
);
check("a fraction of the size", guitar && guitar.sizeBytes < wavSize / 4, `${guitar?.sizeBytes} from ${wavSize}`);
check("the WAV is gone", (await files()).length === 1);
let heard = await clickAt(guitar);
check("its start is where it was: the click still at 1.000 s", Math.abs(heard.at - 1) < 0.001, String(heard.at));
check("the silence after the end trimmed (to 0.3 s)", heard.seconds > 3.2 && heard.seconds < 3.5, String(heard.seconds));

r = await upload({ stemPart: "VOCALS", multitrackId: "mtrecordings01", recordingFirstBeat: 1, process: "encode,level,noise" }, me, takeWav(), "Takes - Vocals.wav");
const vocals = await processed((file) => file.stemPart === "VOCALS");
heard = vocals ? await clickAt(vocals) : { at: NaN };
check("with the noise reduced too (whose filter delays the sound): the click still at 1.000 s", vocals?.mimeType === "audio/ogg" && Math.abs(heard.at - 1) < 0.001, `${heard.at} ${JSON.stringify(vocals)}`);

r = await upload({ stemPart: "BASS", process: "encode" }, me, Buffer.from("ID3 not a wav"), "bass.mp3", "audio/mpeg");
check("only a WAV is processed", r.status === 400, JSON.stringify(r.body));
r = await upload({ stemPart: "BASS", process: "encode,louder" });
check("steps it doesn't know are refused", r.status === 400, JSON.stringify(r.body));

// --- other takes of a part
r = await upload({ stemPart: "GUITAR", multitrackId: "mtrecordings01", otherTake: true }, me, takeWav(), "Takes - Guitar 2.wav");
check("a take kept aside: another take, not played", r.status === 201 && r.body.otherTake === true, JSON.stringify(r.body));
const second = r.body;
r = await call(me, "POST", `/song-versions/${song.id}/attachments/${second.id}/use-take`, { instead: guitar.id });
const byId = (id) => r.body.find((file) => file.id === id);
check("used instead of the first: they swap", r.status === 200 && byId(second.id)?.otherTake === false && byId(guitar.id)?.otherTake === true, JSON.stringify(r.body?.map((f) => [f.filename, f.otherTake])));
r = await call(me, "POST", `/song-versions/${song.id}/attachments/${second.id}/use-take`, { instead: second.id });
check("not instead of itself", r.status === 400, JSON.stringify(r.body));
r = await call(other, "POST", `/song-versions/${song.id}/attachments/${guitar.id}/use-take`, {});
check("someone else can't", r.status === 403 || r.status === 404, String(r.status));

// --- a multitrack for a set
const set = await api(me, "POST", "/setlists", { name: `Sunday ${stamp}` });
const emptySet = await api(me, "POST", "/setlists", { name: `Empty ${stamp}` });
await api(me, "POST", `/setlists/${set.id}/items`, { songVersionId: song.id });
r = await upload({ stemPart: "KEYS", multitrackId: "mtforset00001", multitrackSetlistId: emptySet.id });
check("not for a set the song isn't in", r.status === 400, JSON.stringify(r.body));
r = await upload({ stemPart: "KEYS", multitrackId: "mtforset00001", multitrackSetlistId: set.id });
check("for a set of mine with the song: named", r.status === 201 && r.body.multitrackSetlistId === set.id && r.body.multitrackSetlist?.name === `Sunday ${stamp}`, JSON.stringify(r.body));
const keys = r.body;
r = await call(me, "PATCH", `/song-versions/${song.id}/attachments/${keys.id}`, { multitrackSetlistId: null });
check("and for no set", r.status === 200 && r.body.multitrackSetlistId === null && r.body.multitrackSetlist === null, JSON.stringify(r.body));
await call(me, "PATCH", `/song-versions/${song.id}/attachments/${keys.id}`, { multitrackSetlistId: set.id });
await call(me, "DELETE", `/setlists/${set.id}`);
check("the set deleted, the multitrack stays, for no set", (await files()).find((file) => file.id === keys.id)?.multitrackSetlistId === null);

finish();
