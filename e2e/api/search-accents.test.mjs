// Song search and credit autocomplete ignore accents (issue #56), as they
// already ignored case: "elevation" finds "Élévation", "coeur" finds "cœur".
import { api, call, check, finish, tag, user } from "../lib/harness.mjs";

const me = await user("Accents");
const elevation = await api(me, "POST", "/song-versions", { title: `Élévation ${tag}`, language: "fr", artists: [`Hélène Ségara ${tag}`] });
const coeur = await api(me, "POST", "/song-versions", { title: `Mon cœur ${tag}`, language: "fr", artists: ["Someone"] });
const search = async (q) => (await call(me, "GET", `/song-versions?q=${encodeURIComponent(q)}`)).body.items.map((song) => song.id);

for (const q of [`elevation ${tag}`, `ÉLÉVATION ${tag}`, `élévation ${tag}`, `Elévation ${tag}`]) {
  check(`"${q}" finds Élévation`, (await search(q)).includes(elevation.id));
}
check("an artist without accents finds the song", (await search(`helene segara ${tag}`)).includes(elevation.id));
check('"coeur" finds "cœur"', (await search(`mon coeur ${tag}`)).includes(coeur.id));
check("and the other way round", (await search(`mon cœur ${tag}`)).includes(coeur.id));

// Renaming keeps it current (the database's trigger).
await api(me, "PATCH", `/song-versions/${elevation.id}`, { title: `À toi la gloire ${tag}` });
check("a renamed song is found by its new name, without accents", (await search(`a toi la gloire ${tag}`)).includes(elevation.id));

const r = await call(me, "GET", `/song-versions/credits?q=${encodeURIComponent(`helene seg`)}`);
check(
  "credit autocomplete ignores accents, and suggests the name as written",
  r.status === 200 && r.body.some((credit) => credit.name === `Hélène Ségara ${tag}`),
  JSON.stringify(r.body).slice(0, 200),
);

finish();
