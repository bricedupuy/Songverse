import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

/**
 * BullMQ worker entrypoint — same image and app graph as the API
 * (src/main.ts), no HTTP listener. Queue processors land here as they're
 * added (ChordPro cache regen, Meilisearch reindex, voicing generation,
 * scraper jobs, etc. — see spec §5 "Queue / Background Jobs").
 *
 * With no processors registered yet, nothing holds the event loop open —
 * createApplicationContext resolves and the process exits 0 immediately,
 * which under Swarm's restart policy means a restart loop every few
 * seconds (seen in production 2026-09-16). A bare `process.on('SIGTERM',
 * ...)` listener does NOT keep Node running (verified: it still exits
 * immediately) — only an actual event-loop handle does, hence the
 * `setInterval` below. Once real queue processors land, their BullMQ
 * Redis connections will hold the loop open on their own and this can
 * go away.
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  console.log("SongVerse worker started (no queue processors registered yet)");

  const keepAlive = setInterval(() => {}, 2 ** 31 - 1);

  const shutdown = async (signal: string) => {
    console.log(`SongVerse worker received ${signal}, shutting down`);
    clearInterval(keepAlive);
    await app.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

void bootstrap();
