// Stand-ins for the music services the API asks, for the suites: Apple's
// iTunes Search API and its artwork (issue #85; ITUNES_SEARCH_URL), and
// MusicBrainz and Deezer (issue #22; MUSICBRAINZ_API_URL at /mb/ws/2/,
// DEEZER_API_URL at /deezer). A search for anything with "Nomatch" in it
// finds nothing; "Deezerdown" makes Deezer fail. Otherwise, for a title and
// an artist:
// - Apple Music: three albums, "Album 1" (2013), "Album 2" (2016) and
//   "Album 3" (2019), each with artwork of its own colour;
// - MusicBrainz: the song, first released on "Album 1" (listed after a 2016
//   compilation), a karaoke version from 2010, and the title by another band;
// - Deezer: the song on "Album 1" and on "Live 2020".
import { createServer } from "node:http";
import { deflateSync } from "node:zlib";

export const FAKE_PROVIDERS_PORT = Number(process.env.FAKE_PROVIDERS_PORT ?? 3999);
export const FAKE_PROVIDERS_URL = `http://localhost:${FAKE_PROVIDERS_PORT}`;
const URL_ = FAKE_PROVIDERS_URL;

/** A 16x16 PNG of one colour. */
function png(r, g, b) {
  const crc = (buf) => {
    let c = ~0;
    for (const byte of buf) {
      c ^= byte;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(8 + data.length + 4);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), 8 + data.length);
    return out;
  };
  const size = 16;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 2;
  const rows = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) rows.set([r, g, b], y * (1 + size * 3) + 1 + x * 3);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}

const COLOURS = [
  [200, 40, 40],
  [40, 160, 60],
  [40, 60, 200],
];

const json = (res, body, status = 200) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

// --- Apple Music
const APPLE_DATES = ["2013-02-22T08:00:00Z", "2016-06-01T07:00:00Z", "2019-09-13T07:00:00Z"];
const appleSong = (title, artist, n) => ({
  wrapperType: "track",
  trackId: 1000 + n,
  trackName: title,
  artistName: artist,
  collectionName: `Album ${n + 1}`,
  releaseDate: APPLE_DATES[n],
  artworkUrl100: `${URL_}/art/${n}/100x100bb.png`,
  trackViewUrl: `https://music.apple.com/us/album/x/${2000 + n}?i=${1000 + n}`,
});
/** Apple searches "title artist": the artist is the last word. */
const splitTerm = (term) => ({ title: term.replace(/\s+\S+$/, ""), artist: term.split(" ").at(-1) ?? "Someone" });
const lastApple = new Map();

// --- MusicBrainz
const mbid = (n, title) => `00000000-0000-4000-8000-${String(n).padStart(4, "0")}${Buffer.from(title).toString("hex").slice(0, 8).padEnd(8, "0")}`;
const lastRecordings = new Map();
function recordings(title, artist) {
  const credit = (name) => [{ name }];
  return [
    {
      id: mbid(1, title),
      title,
      score: 100,
      "artist-credit": credit(artist),
      "first-release-date": "2013-02-22",
      releases: [
        { title: "Best of Worship", date: "2016-01-01", status: "Official" },
        { title: "Album 1", date: "2013-02-22", status: "Official" },
      ],
    },
    { id: mbid(2, title), title: `${title} (Karaoke Version)`, score: 90, "artist-credit": credit(artist), "first-release-date": "2010", releases: [{ title: "Sing Along", date: "2010" }] },
    { id: mbid(3, title), title, score: 80, "artist-credit": credit("Other Band"), "first-release-date": "1990", releases: [{ title: "Old Songs", date: "1990" }] },
  ];
}
const unescape = (text) => text.replace(/\\(.)/g, "$1");

// --- Deezer
const lastDeezer = new Map();
const deezerTracks = (title, artist) => [
  { id: 5001, title, link: "https://www.deezer.com/track/5001", artist: { name: artist }, album: { id: 7001, title: "Album 1", cover_medium: `${URL_}/art/2/250x250.png`, cover_xl: `${URL_}/art/2/1000x1000.png` } },
  { id: 5002, title, link: "https://www.deezer.com/track/5002", artist: { name: artist }, album: { id: 7002, title: "Live 2020", cover_medium: `${URL_}/art/1/250x250.png`, cover_xl: `${URL_}/art/1/1000x1000.png` } },
];
const ALBUM_DATES = { 7001: "2013-02-22", 7002: "2020-05-01" };

export function startFakeProviders() {
  const server = createServer((req, res) => {
    const url = new URL(req.url, URL_);
    const path = url.pathname;
    if (path === "/search") {
      const term = url.searchParams.get("term") ?? "";
      const { title, artist } = splitTerm(term);
      const results = /nomatch/i.test(term) ? [] : [0, 1, 2].map((n) => appleSong(title, artist, n));
      for (const song of results) lastApple.set(String(song.trackId), song);
      return json(res, { resultCount: results.length, results });
    }
    if (path === "/lookup") {
      const song = lastApple.get(url.searchParams.get("id") ?? "");
      return json(res, { resultCount: song ? 1 : 0, results: song ? [song] : [] });
    }
    if (path === "/mb/ws/2/recording") {
      const query = url.searchParams.get("query") ?? "";
      const title = unescape(/recording:"((?:[^"\\]|\\.)*)"/.exec(query)?.[1] ?? "");
      const artist = unescape(/artist:"((?:[^"\\]|\\.)*)"/.exec(query)?.[1] ?? "Someone");
      const found = /nomatch/i.test(title) ? [] : recordings(title, artist);
      for (const recording of found) lastRecordings.set(recording.id, recording);
      return json(res, { recordings: found });
    }
    const recording = /^\/mb\/ws\/2\/recording\/([\w-]+)$/.exec(path);
    if (recording) {
      const found = lastRecordings.get(recording[1]);
      return found ? json(res, found) : json(res, { error: "Not Found" }, 404);
    }
    if (path === "/deezer/search") {
      const q = url.searchParams.get("q") ?? "";
      if (/deezerdown/i.test(q)) return json(res, { error: "down" }, 500);
      const title = /track:"([^"]*)"/.exec(q)?.[1] ?? q;
      const artist = /artist:"([^"]*)"/.exec(q)?.[1] ?? "Someone";
      const data = /nomatch/i.test(q) ? [] : deezerTracks(title, artist);
      for (const track of data) lastDeezer.set(String(track.id), track);
      return json(res, { data, total: data.length });
    }
    const album = /^\/deezer\/album\/(\d+)$/.exec(path);
    if (album) return json(res, ALBUM_DATES[album[1]] ? { id: Number(album[1]), release_date: ALBUM_DATES[album[1]] } : { error: { type: "DataException", message: "no data", code: 800 } });
    const track = /^\/deezer\/track\/(\d+)$/.exec(path);
    if (track) {
      const found = lastDeezer.get(track[1]);
      return json(res, found ? { ...found, release_date: ALBUM_DATES[found.album.id] } : { error: { type: "DataException", message: "no data", code: 800 } });
    }
    const art = /^\/art\/(\d)\//.exec(path);
    if (art) {
      res.writeHead(200, { "Content-Type": "image/png" });
      res.end(png(...COLOURS[Number(art[1])]));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(FAKE_PROVIDERS_PORT, () => resolve(server));
  });
}
