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
 * createApplicationContext resolves and the process would exit 0
 * immediately, which under Swarm's restart policy means a restart loop
 * every few seconds (seen in production 2026-09-16). Registering signal
 * handlers keeps the event loop alive and, since Docker sends SIGTERM on
 * stop/redeploy, gives Nest a chance to close DB/Redis connections instead
 * of losing them to a SIGKILL after the grace period.
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  console.log("SongVerse worker started (no queue processors registered yet)");

  const shutdown = async (signal: string) => {
    console.log(`SongVerse worker received ${signal}, shutting down`);
    await app.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

void bootstrap();
