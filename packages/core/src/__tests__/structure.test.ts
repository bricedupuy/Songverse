import { describe, expect, it } from "vitest";
import { songDocumentFromText } from "../song-document/text.js";
import { renderChart } from "../song-document/render.js";
import { structureOf } from "../song-document/structure.js";

const song = (content: string) => renderChart(songDocumentFromText(null, { content, format: "CHORDPRO" }));

describe("structureOf", () => {
  it("numbers sections of a type when there are several, and a repeat keeps its number", () => {
    const chart = song(`{start_of_verse}
[G]One
{end_of_verse}
{start_of_chorus}
[C]Chorus
{end_of_chorus}
{start_of_verse}
[G]Two
{end_of_verse}
{chorus}
{start_of_bridge}
[D]Bridge
{end_of_bridge}
{chorus}
`);
    expect(structureOf(chart).map((step) => `${step.type}${step.number ?? ""}:${step.group}`)).toEqual([
      "verse1:verse",
      "chorus:chorus",
      "verse2:verse",
      "chorus:chorus",
      "bridge:bridge",
      "chorus:chorus",
    ]);
  });

  it("gives intro and outro the same colour, and each pass its own ID", () => {
    const chart = song(`{start_of_intro}
[G]
{end_of_intro}
{start_of_outro}
[G]
{end_of_outro}
`);
    const steps = structureOf(chart);
    expect(steps.map((step) => step.group)).toEqual(["edge", "edge"]);
    expect(new Set(steps.map((step) => step.passId)).size).toBe(2);
  });
});
