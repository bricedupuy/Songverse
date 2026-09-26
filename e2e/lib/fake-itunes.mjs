// A stand-in for Apple's iTunes Search API and its artwork (issue #85), for
// the suites: the API is pointed at it with ITUNES_SEARCH_URL. A search for
// anything with "Nomatch" in it finds nothing; otherwise three albums, each
// with artwork of its own colour.
import { createServer } from "node:http";
import { deflateSync } from "node:zlib";

export const FAKE_ITUNES_PORT = Number(process.env.FAKE_ITUNES_PORT ?? 3999);
export const FAKE_ITUNES_URL = `http://localhost:${FAKE_ITUNES_PORT}`;

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

export function startFakeItunes() {
  const server = createServer((req, res) => {
    const url = new URL(req.url, FAKE_ITUNES_URL);
    if (url.pathname === "/search") {
      const term = url.searchParams.get("term") ?? "";
      const [title, ...artist] = term.split(" ");
      void title;
      const results = /nomatch/i.test(term)
        ? []
        : [0, 1, 2].map((n) => ({
            trackName: term.replace(/\s+\S+$/, ""),
            artistName: artist.at(-1) ?? "Someone",
            collectionName: `Album ${n + 1}`,
            artworkUrl100: `${FAKE_ITUNES_URL}/art/${n}/100x100bb.png`,
          }));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ resultCount: results.length, results }));
      return;
    }
    const art = /^\/art\/(\d)\//.exec(url.pathname);
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
    server.listen(FAKE_ITUNES_PORT, () => resolve(server));
  });
}
