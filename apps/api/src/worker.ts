import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

/**
 * BullMQ worker entrypoint — same image and app graph as the API
 * (src/main.ts), no HTTP listener. Queue processors land here as they're
 * added (ChordPro cache regen, Meilisearch reindex, voicing generation,
 * scraper jobs, etc. — see spec §5 "Queue / Background Jobs").
 */
async function bootstrap() {
  await NestFactory.createApplicationContext(AppModule);
  console.log("SongVerse worker started (no queue processors registered yet)");
}

void bootstrap();
