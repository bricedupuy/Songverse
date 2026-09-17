import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import {
  SEED_TAG_CATEGORIES,
  SEED_TUNING_PRESETS,
  parseArrangementDocument,
  parseMidiItemTriggers,
  parseSongDocument,
} from "@songverse/core";

const prisma = new PrismaClient();

function loadFixture(name: string): unknown {
  const path = fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf-8"));
}

async function seedTagCategories() {
  for (const category of SEED_TAG_CATEGORIES) {
    const translations = { fr: category.fr };
    await prisma.tagCategory.upsert({
      where: { slug: category.slug },
      update: { label: category.label, translations },
      create: { slug: category.slug, label: category.label, translations, isGlobal: true },
    });
  }
  console.log(`Seeded ${SEED_TAG_CATEGORIES.length} tag categories.`);
}

// A modest curated starting set per category - enough to make tagging
// useful immediately. Users/teams can add their own scoped tags later;
// this seed only covers the admin-curated global ones. `en` is the
// canonical label (and slug source); `fr` seeds Tag.translations.
const SEED_TAGS: Record<string, Array<{ en: string; fr: string }>> = {
  theme: [
    { en: "Christmas", fr: "Noël" },
    { en: "Easter", fr: "Pâques" },
    { en: "Communion", fr: "Communion" },
    { en: "Baptism", fr: "Baptême" },
    { en: "Advent", fr: "Avent" },
    { en: "Thanksgiving", fr: "Action de grâce" },
    { en: "Funeral & Memorial", fr: "Funérailles" },
    { en: "Wedding", fr: "Mariage" },
  ],
  style: [
    { en: "Contemporary", fr: "Contemporain" },
    { en: "Traditional Hymn", fr: "Hymne traditionnel" },
    { en: "Gospel", fr: "Gospel" },
    { en: "Folk", fr: "Folk" },
    { en: "Acoustic", fr: "Acoustique" },
    { en: "Rock", fr: "Rock" },
    { en: "Orchestral", fr: "Orchestral" },
    { en: "Jazz", fr: "Jazz" },
  ],
  mood: [
    { en: "Joyful", fr: "Joyeux" },
    { en: "Reflective", fr: "Méditatif" },
    { en: "Triumphant", fr: "Triomphant" },
    { en: "Peaceful", fr: "Paisible" },
    { en: "Intense", fr: "Intense" },
    { en: "Tender", fr: "Tendre" },
  ],
  instrumentation: [
    { en: "Guitar-led", fr: "Guitare principale" },
    { en: "Piano-led", fr: "Piano principal" },
    { en: "Full Band", fr: "Groupe complet" },
    { en: "A Cappella", fr: "A cappella" },
    { en: "Orchestral", fr: "Orchestral" },
    { en: "Acoustic Only", fr: "Acoustique uniquement" },
  ],
};

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function seedTags() {
  let count = 0;
  for (const category of SEED_TAG_CATEGORIES) {
    const entries = SEED_TAGS[category.slug] ?? [];
    if (entries.length === 0) continue;
    const { id: categoryId } = await prisma.tagCategory.findUniqueOrThrow({ where: { slug: category.slug } });
    for (const [index, { en: label, fr }] of entries.entries()) {
      const slug = slugify(label);
      const translations = { fr };
      await prisma.tag.upsert({
        where: { slug },
        update: { label, translations, sortOrder: index },
        create: { categoryId, slug, label, translations, scope: "GLOBAL", isApproved: true, sortOrder: index },
      });
      count++;
    }
  }
  console.log(`Seeded ${count} tags.`);
}

async function seedTuningPresets() {
  for (const [index, preset] of SEED_TUNING_PRESETS.entries()) {
    await prisma.tuningPreset.upsert({
      where: { slug: preset.slug },
      update: {
        name: preset.name,
        instrument: preset.instrument,
        notes: [...preset.notes],
        isDefault: preset.isDefault,
      },
      create: {
        slug: preset.slug,
        name: preset.name,
        instrument: preset.instrument,
        notes: [...preset.notes],
        isStandard: true,
        isDefault: preset.isDefault,
        sortOrder: index,
      },
    });
  }
  console.log(`Seeded ${SEED_TUNING_PRESETS.length} tuning presets.`);
}

async function seedDemoContent() {
  const author = await prisma.user.upsert({
    where: { email: "demo-author@songverse.one" },
    update: {},
    create: {
      email: "demo-author@songverse.one",
      displayName: "A. Songwriter",
      emailVerified: true,
    },
  });

  const arranger = await prisma.user.upsert({
    where: { email: "demo-arranger@songverse.one" },
    update: {},
    create: {
      email: "demo-arranger@songverse.one",
      displayName: "B. Arranger",
      emailVerified: true,
    },
  });

  const team = await prisma.team.upsert({
    where: { slug: "demo-worship-team" },
    update: {},
    create: {
      name: "Demo Worship Team",
      slug: "demo-worship-team",
      description: "Seed team for local development and Phase 1 smoke tests.",
      memberships: {
        create: [
          { userId: author.id, role: "ADMIN" },
          { userId: arranger.id, role: "MEMBER" },
        ],
      },
    },
  });

  const work = await prisma.work.create({ data: {} });

  const songDocumentRaw = loadFixture("morning-light-song.json");
  const songDocument = parseSongDocument(songDocumentRaw);

  const songVersion = await prisma.songVersion.create({
    data: {
      workId: work.id,
      ownerScope: "TEAM",
      ownerTeamId: team.id,
      publicationState: "DRAFT",
      title: songDocument.metadata.title,
      alternateTitle: songDocument.metadata.alternateTitle ?? null,
      language: songDocument.metadata.language,
      trustLabel: songDocument.metadata.trustLabel ?? null,
      copyright: songDocument.metadata.copyright ?? null,
      copyrightYear: songDocument.metadata.copyrightYear ?? null,
      publisher: songDocument.metadata.publisher ?? null,
      ccli: songDocument.metadata.ccli ?? null,
      documentJson: songDocumentRaw as object,
      relationshipType: "ORIGINAL",
      contributors: {
        create: [
          { userId: author.id, roles: ["AUTHOR", "COMPOSER", "LYRICIST"], displayOrder: 0 },
          { userId: arranger.id, roles: ["ARRANGER"], displayOrder: 1 },
        ],
      },
    },
  });

  await prisma.work.update({
    where: { id: work.id },
    data: { preferredOriginalVersionId: songVersion.id },
  });

  const arrangementRaw = loadFixture("morning-light-arrangement.json") as { songVersionId: string };
  arrangementRaw.songVersionId = songVersion.id;
  const arrangementDocument = parseArrangementDocument(arrangementRaw);

  const standardTuning = await prisma.tuningPreset.findUniqueOrThrow({ where: { slug: "standard_guitar" } });

  const arrangement = await prisma.arrangement.create({
    data: {
      songVersionId: songVersion.id,
      ownerScope: "TEAM",
      ownerTeamId: team.id,
      name: "Full Band (Standard Tuning)",
      description: "Standard-tuning full band arrangement with a key change into the final chorus.",
      documentJson: arrangementRaw as object,
      guitarTuningPresetId: standardTuning.id,
    },
  });
  // Referenced for parity with the schema validation above; not persisted separately.
  void arrangementDocument;

  const midiTriggersRaw = loadFixture("morning-light-midi.json");
  const midiTriggers = parseMidiItemTriggers(midiTriggersRaw);

  await prisma.userArrangementMidi.upsert({
    where: { userId_arrangementId: { userId: arranger.id, arrangementId: arrangement.id } },
    update: { itemTriggersJson: midiTriggers as object },
    create: {
      userId: arranger.id,
      arrangementId: arrangement.id,
      enabled: true,
      itemTriggersJson: midiTriggers as object,
    },
  });

  console.log("Seeded demo team, work, song version, arrangement, and MIDI config for 'Morning Light'.");
}

async function main() {
  await seedTagCategories();
  await seedTags();
  await seedTuningPresets();
  await seedDemoContent();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
