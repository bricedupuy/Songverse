// Songs stored as SongDocument v2 (docs/song-document-v2.md): what's stored,
// IDs surviving text edits, the revision check, exports built from the
// columns, and songs saved before v2 served as v2.
import { stamp, sql, check, user, call, finish } from "../lib/harness.mjs";

const me = await user("Doc owner");
const CHART = "{start_of_verse}\n[G]Amazing grace how [G7]sweet the [C]sound\nThat [G]saved a wretch like me\n{end_of_verse}\n\n{start_of_chorus}\n[C]My chains are [G]gone\n{end_of_chorus}\n";
const ids = (doc) => ({
  sections: doc.sections.map((s) => s.id),
  lines: doc.sections.flatMap((s) => s.lines.map((l) => l.id)),
  chords: doc.sections.flatMap((s) => s.lines.flatMap((l) => l.chords.map((c) => c.id))),
});

let r = await call(me, "POST", "/song-versions", {
  title: `Doc Song ${stamp}`,
  language: "en",
  artists: ["Chris Tomlin"],
  composers: ["John Newton"],
  key: "G",
  tempo: 72,
  capo: 2,
  ccli: "4768151",
  content: CHART,
  contentFormat: "CHORDPRO",
});
const songId = r.body.id;
let doc = (await call(me, "GET", `/song-versions/${songId}`)).body.documentJson;
check(
  "a new song is stored as v2, revision 1, sung in the order written",
  doc.$schema === "song-document/v2" && doc.revision === 1 && !("metadata" in doc) &&
    doc.flow.map((item) => item.sectionId).join() === doc.sections.map((s) => s.id).join(),
  JSON.stringify({ schema: doc.$schema, revision: doc.revision, flow: doc.flow }),
);
const first = doc.sections[0].lines[0];
check(
  "a line is one text, chords pinned to characters",
  first.text === "Amazing grace how sweet the sound" && first.chords.map((c) => `${c.raw}@${c.at}`).join() === "G@0,G7@18,C@28",
  JSON.stringify(first),
);
check("capo is on the song, not in the document", (await call(me, "GET", `/song-versions/${songId}`)).body.capo === 2 && !("capo" in doc.defaults));

// --- editing the text keeps IDs
const before = ids(doc);
r = await call(me, "PATCH", `/song-versions/${songId}`, {
  content: CHART.replace("Amazing grace how [G7]sweet", "Amazing grace, how sweet [G7]the").replace("[C]sound", "[Cadd9]sound"),
  contentFormat: "CHORDPRO",
  revision: 1,
});
check("a text edit saves as revision 2", r.status === 200 && r.body.documentJson.revision === 2, `${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
doc = r.body.documentJson;
check("lines and chords keep their IDs through a lyric fix, a chord move and a chord change", JSON.stringify(ids(doc)) === JSON.stringify(before), JSON.stringify({ before, after: ids(doc) }));
check("the moved chord sits on its new character", doc.sections[0].lines[0].chords[1].at === 25);

r = await call(me, "PATCH", `/song-versions/${songId}`, { content: CHART, contentFormat: "CHORDPRO", revision: 1 });
check("a save from an older revision is refused", r.status === 409, `${r.status} ${JSON.stringify(r.body)}`);
check("and changes nothing", (await call(me, "GET", `/song-versions/${songId}`)).body.documentJson.revision === 2);

r = await call(me, "PATCH", `/song-versions/${songId}`, { notes: "Only a note", revision: 2 });
check("changing only the song's details leaves the document alone", r.status === 200 && r.body.documentJson.revision === 2);
r = await call(me, "PATCH", `/song-versions/${songId}`, { tempo: 80 });
check("changing the tempo is a new revision, same IDs", r.body.documentJson.revision === 3 && r.body.documentJson.defaults.tempo === 80 && JSON.stringify(ids(r.body.documentJson)) === JSON.stringify(before));

r = await call(me, "PATCH", `/song-versions/${songId}`, {
  content: CHART.replace("{start_of_chorus}", "{start_of_bridge}\n[Em]Through many dangers\n{end_of_bridge}\n\n{start_of_chorus}"),
  contentFormat: "CHORDPRO",
});
doc = r.body.documentJson;
check(
  "a section inserted between two keeps both of theirs",
  doc.sections.length === 3 && doc.sections[0].id === before.sections[0] && doc.sections[2].id === before.sections[1] && !before.sections.includes(doc.sections[1].id),
);

// --- the structured editor saves sections, IDs as they are
const moved = structuredClone(doc.sections);
moved[0].lines[0].chords[0].at = 8;
moved.push({ id: "sec_editor_added", type: "tag", showLabel: false, lines: [{ id: "line_editor_added", kind: "lyric", text: "Amen", chords: [{ id: "chd_editor_added", at: 0, raw: "G" }] }] });
r = await call(me, "PATCH", `/song-versions/${songId}`, { sections: moved, revision: doc.revision });
check(
  "sections saved from the editor keep every ID exactly",
  r.status === 200 && JSON.stringify(r.body.documentJson.sections) === JSON.stringify(moved) && r.body.documentJson.revision === doc.revision + 1,
  `${r.status} ${JSON.stringify(r.body).slice(0, 300)}`,
);
check("a section added in the editor joins the flow", r.body.documentJson?.flow.at(-1)?.sectionId === "sec_editor_added");
const saved = r.body.documentJson;
const clash = structuredClone(saved.sections);
clash[3].lines[0].id = clash[0].lines[0].id;
r = await call(me, "PATCH", `/song-versions/${songId}`, { sections: clash, revision: saved.revision });
check("sections with a duplicate ID are refused", r.status === 400 && /Duplicate id/.test(r.body.message), `${r.status} ${JSON.stringify(r.body)}`);
const misplaced = structuredClone(saved.sections);
misplaced[0].lines[0].chords[0].at = 999;
r = await call(me, "PATCH", `/song-versions/${songId}`, { sections: misplaced, revision: saved.revision });
check("a chord past the end of its line is refused", r.status === 400 && /past the end/.test(r.body.message), `${r.status} ${JSON.stringify(r.body)}`);
r = await call(me, "PATCH", `/song-versions/${songId}`, { sections: saved.sections, content: CHART, revision: saved.revision });
check("content and sections together are refused", r.status === 400);
r = await call(me, "PATCH", `/song-versions/${songId}`, { sections: moved, revision: saved.revision - 1 });
check("sections from an older revision are refused", r.status === 409);
r = await call(me, "POST", "/song-versions", { title: `Doc Sections ${stamp}`, language: "en", artists: ["Someone"], sections: moved.slice(3) });
const fromSections = r.status === 201 ? (await call(me, "GET", `/song-versions/${r.body.id}`)).body.documentJson : null;
check(
  "a new song can be created from sections",
  fromSections?.sections[0].id === "sec_editor_added" && fromSections.flow.length === 1,
  `${r.status} ${JSON.stringify(fromSections ?? r.body).slice(0, 200)}`,
);
doc = saved;
moved.pop();
moved[0].lines[0].chords[0].at = 0;
r = await call(me, "PATCH", `/song-versions/${songId}`, { sections: moved, revision: saved.revision });
check("deleting a section in the editor takes it out of the flow", r.status === 200 && !r.body.documentJson.flow.some((item) => item.sectionId === "sec_editor_added"));

// --- ChordPro export: details from the columns, the chart from the document
r = await call(me, "GET", `/song-versions/${songId}/chordpro`);
const file = r.body.content;
check(
  "the ChordPro export carries the song's details and chart",
  file.startsWith(`{title: Doc Song ${stamp}}\n{artist: Chris Tomlin}\n{composer: John Newton}\n{ccli: 4768151}\n{key: G}\n{tempo: 80}\n{capo: 2}\n\n{start_of_verse}`) &&
    file.includes("[G]Amazing grace how [G7]sweet the [C]sound\nThat [G]saved") &&
    file.includes("{end_of_verse}\n\n{start_of_bridge}"),
  file,
);

// --- a set's song view: v2 sections and the order they're sung in
const set = (await call(me, "POST", "/setlists", { name: `Doc Set ${stamp}` })).body;
const item = (await call(me, "POST", `/setlists/${set.id}/items`, { songVersionId: songId, transposeSteps: 2 })).body.items[0];
r = await call(me, "GET", `/setlists/${set.id}/items/${item.id}/song`);
check(
  "a set shows the song as v2, with its flow",
  r.status === 200 && r.body.song.sections[0].lines[0].chords.length === 3 && r.body.song.flow.length === 3 && r.body.song.tempo === 80,
  JSON.stringify(r.body.song).slice(0, 300),
);

// --- a song saved before v2 is served as v2, and saving it writes v2
const old = (await call(me, "POST", "/song-versions", { title: `Old Song ${stamp}`, language: "en", artists: ["Old"] })).body;
const v1 = {
  $schema: "song-document/v1",
  metadata: { title: "Old Song", language: "en" },
  defaults: { key: "D", capo: 3 },
  sections: [
    {
      id: "sec_old",
      type: "verse",
      lines: [
        {
          id: "line_old",
          segments: [
            { id: "seg_1", lyric: "Breath be-", chord: { id: "chd_1", raw: "D", normalized: null } },
            { id: "seg_2", lyric: "fore", chord: { id: "chd_2", raw: "A", normalized: null } },
          ],
        },
      ],
    },
  ],
};
// sql() goes through a shell: "$" is written as a JSON escape so it isn't expanded.
sql(`update "SongVersion" set "documentJson" = '${JSON.stringify(v1).replace(/\$/g, "\\u0024")}'::jsonb where id = '${old.id}'`);
doc = (await call(me, "GET", `/song-versions/${old.id}`)).body.documentJson;
check(
  "a v1 song is read as v2, IDs kept, its words as saved",
  doc.$schema === "song-document/v2" && doc.sections[0].id === "sec_old" && doc.sections[0].lines[0].text === "Breath be-fore" &&
    doc.sections[0].lines[0].chords.map((c) => `${c.id}@${c.at}`).join() === "chd_1@0,chd_2@10",
  JSON.stringify(doc),
);
r = await call(me, "PATCH", `/song-versions/${old.id}`, { tempo: 90 });
check(
  "saving it writes it as v2",
  r.status === 200 && sql(`select "documentJson"->>(chr(36) || 'schema') from "SongVersion" where id = '${old.id}'`) === "song-document/v2",
  `${r.status}`,
);

finish();
