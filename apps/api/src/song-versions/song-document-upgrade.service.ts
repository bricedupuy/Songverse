import { Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";
import { readSongDocument } from "@songverse/core";
import type { Prisma } from "@songverse/db";
import { PrismaService } from "../prisma/prisma.service";

const BATCH = 100;

/**
 * Writes songs saved before SongDocument v2 back as v2, once, at startup
 * (docs/song-document-v2.md, "Migrating from v1"). Until a song's turn
 * comes it's already served as v2 - every read goes through
 * readSongDocument() - so this only saves converting it again each time.
 *
 * Each write only happens if the song is still as it was read, so a save
 * made meanwhile is never overwritten; running it twice, or on several
 * instances at once, is harmless. A song that can't be converted is
 * logged and left as it is.
 */
@Injectable()
export class SongDocumentUpgradeService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SongDocumentUpgradeService.name);

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap(): void {
    // In the background: the API serves requests meanwhile.
    void this.upgradeAll().catch((error: unknown) => this.logger.error("Song document upgrade stopped", error as Error));
  }

  async upgradeAll(): Promise<{ upgraded: number; failed: number }> {
    let upgraded = 0;
    let failed = 0;
    const skipped = new Set<string>();
    for (;;) {
      const rows = await this.prisma.client.songVersion.findMany({
        where: { documentJson: { path: ["$schema"], equals: "song-document/v1" }, id: { notIn: [...skipped] } },
        select: { id: true, documentJson: true },
        take: BATCH,
      });
      if (rows.length === 0) break;
      for (const row of rows) {
        try {
          const document = readSongDocument(row.documentJson);
          const { count } = await this.prisma.client.songVersion.updateMany({
            where: { id: row.id, documentJson: { equals: row.documentJson as Prisma.InputJsonValue } },
            data: { documentJson: document as object },
          });
          upgraded += count;
          if (count === 0) skipped.add(row.id);
        } catch (error) {
          failed++;
          skipped.add(row.id);
          this.logger.warn(`Song ${row.id} could not be upgraded to SongDocument v2: ${(error as Error).message}`);
        }
      }
    }
    if (upgraded || failed) this.logger.log(`Upgraded ${upgraded} song documents to v2${failed ? `, ${failed} left as they were` : ""}`);
    return { upgraded, failed };
  }
}
