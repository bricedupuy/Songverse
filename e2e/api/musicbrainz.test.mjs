// A linked MusicBrainz recording/work is shown from what was saved when it
// was linked, without looking it up again. The ids here are made up, so a
// lookup would fail: getting the saved summary back proves none happened.
import { call, check, finish, sql, stamp, user } from "../lib/harness.mjs";

const me = await user("owner");
const song = (await call(me, "POST", "/song-versions", { title: `MB ${stamp}`, language: "en", artists: ["Test Artist"] })).body;
const recording = {
  mbid: "00000000-0000-4000-8000-000000000001",
  title: `MB ${stamp}`,
  artist: "Saved Artist",
  releaseTitle: "Saved Album",
  releaseDate: "2019-05-01",
  score: 100,
  sourceUrl: "https://musicbrainz.org/recording/00000000-0000-4000-8000-000000000001",
};
const work = { mbid: "00000000-0000-4000-8000-000000000002", title: `MB ${stamp}`, iswc: "T-123.456.789-0", language: "eng", score: 100, sourceUrl: "https://musicbrainz.org/work/00000000-0000-4000-8000-000000000002" };
const json = (value) => JSON.stringify(value).replace(/'/g, "''");
sql(`insert into "SongVersionIdentifier" (id, "songVersionId", type, value, "sourceUrl", details, "updatedAt") values ('mbr${stamp}', '${song.id}', 'MUSICBRAINZ_RECORDING', '${recording.mbid}', '${recording.sourceUrl}', '${json(recording)}', now())`);
sql(`insert into "WorkIdentifier" (id, "workId", type, value, "sourceUrl", details, "updatedAt") values ('mbw${stamp}', '${song.workId}', 'MUSICBRAINZ_WORK', '${work.mbid}', '${work.sourceUrl}', '${json(work)}', now())`);

let r = await call(me, "GET", `/song-versions/${song.id}/musicbrainz`);
check("the linked recording comes from what was saved", r.status === 200 && r.body?.artist === "Saved Artist" && r.body?.releaseTitle === "Saved Album", `${r.status} ${JSON.stringify(r.body)}`);
r = await call(me, "GET", `/works/${song.workId}/musicbrainz`);
check("the linked work comes from what was saved", r.status === 200 && r.body?.iswc === "T-123.456.789-0", `${r.status} ${JSON.stringify(r.body)}`);

r = await call(me, "DELETE", `/song-versions/${song.id}/musicbrainz-link`);
r = await call(me, "GET", `/song-versions/${song.id}/musicbrainz`);
check("after unlinking there's nothing", r.status === 200 && (r.body === null || r.body === undefined), `${r.status} ${JSON.stringify(r.body)}`);

finish();
