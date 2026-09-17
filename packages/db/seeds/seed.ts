import { prisma } from "../src/index.js";
import { runSeed } from "../src/seed.js";

runSeed()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
