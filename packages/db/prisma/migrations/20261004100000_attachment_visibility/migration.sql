-- CreateEnum
CREATE TYPE "AttachmentVisibility" AS ENUM ('PRIVATE', 'TEAM', 'SONG');

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "visibility" "AttachmentVisibility" NOT NULL DEFAULT 'SONG',
ADD COLUMN     "visibleToTeamId" TEXT;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_visibleToTeamId_fkey" FOREIGN KEY ("visibleToTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

