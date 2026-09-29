import type { SectionType } from "../constants/index.js";
import type { RenderedChart } from "./render.js";

/** Kinds of section that share a colour in the structure bar (issue #68). */
export type StructureGroup = "edge" | "verse" | "chorus" | "bridge" | "instrumental" | "other";

const GROUPS: Record<SectionType, StructureGroup> = {
  intro: "edge",
  outro: "edge",
  tag: "edge",
  verse: "verse",
  "pre-chorus": "verse",
  chorus: "chorus",
  "post-chorus": "chorus",
  bridge: "bridge",
  instrumental: "instrumental",
  other: "other",
};

/** The colour group of a kind of section. */
export function structureGroupOf(type: SectionType): StructureGroup {
  return GROUPS[type] ?? "other";
}

/** One pass of the song, as the structure bar shows it. */
export interface StructureStep {
  /** The pass's ID, as the chart renders it (data-pass). */
  passId: string;
  type: SectionType;
  /** Verse 1, verse 2...: which section of its type, when the song has several; null when it has one. */
  number: number | null;
  group: StructureGroup;
}

/**
 * The song's passes in the order they're sung, for Live's structure bar:
 * V1 C V2 C B C. Sections are numbered by type in the order they first
 * come, and only when a song has more than one of that type; a section
 * sung again keeps its number.
 */
export function structureOf(chart: RenderedChart): StructureStep[] {
  const byType = new Map<SectionType, string[]>();
  for (const pass of chart.passes) {
    const type = pass.section.type as SectionType;
    const seen = byType.get(type) ?? [];
    if (!seen.includes(pass.section.id)) seen.push(pass.section.id);
    byType.set(type, seen);
  }
  return chart.passes.map((pass) => {
    const type = pass.section.type as SectionType;
    const sections = byType.get(type) ?? [];
    return {
      passId: pass.id,
      type,
      number: sections.length > 1 ? sections.indexOf(pass.section.id) + 1 : null,
      group: GROUPS[type] ?? "other",
    };
  });
}
