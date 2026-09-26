// Linked songs (issue #78): a translation or adaptation is a song of its
// own, linked to the song it comes from - a translation in another
// language, an adaptation in the same one - listed with it.
import { api, check, finish, stamp, user } from "../lib/harness.mjs";

const me = await user("Linker");
const other = await user("Other");
const original = await api(me, "POST", "/song-versions", { title: `Original ${stamp}`, language: "en", artists: ["Band"] });
const french = await api(me, "POST", "/song-versions", { title: `Traduit ${stamp}`, language: "fr", artists: ["Band"], basedOnVersionId: original.id });
const kids = await api(me, "POST", "/song-versions", { title: `Kids ${stamp}`, language: "en", artists: ["Band"], basedOnVersionId: original.id });

const detail = await api(me, "GET", `/song-versions/${french.id}`);
check("another language: a translation of it, a song of its own", detail.relationshipType === "DIRECT_TRANSLATION" && detail.parentVersion?.id === original.id && detail.title === `Traduit ${stamp}` && detail.workId === original.workId);
check("the same language: an adaptation", (await api(me, "GET", `/song-versions/${kids.id}`)).relationshipType === "LYRICAL_ADAPTATION");
const work = await api(me, "GET", `/works/${original.workId}`);
const byId = Object.fromEntries(work.versions.map((v) => [v.id, v]));
check(
  "listed together, each with how it's linked",
  work.versions.length === 3 && byId[french.id]?.parentVersionId === original.id && byId[french.id]?.relationshipType === "DIRECT_TRANSLATION" && byId[original.id]?.parentVersionId === null,
  JSON.stringify(work.versions),
);
const theirs = await api(other, "POST", "/song-versions", { title: `Autre ${stamp}`, language: "fr", artists: ["Band"] });
check("a song of someone else's isn't listed with mine", !(await api(me, "GET", `/works/${original.workId}`)).versions.some((v) => v.id === theirs.id));

finish();
