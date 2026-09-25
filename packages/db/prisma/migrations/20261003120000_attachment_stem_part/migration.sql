-- CreateEnum
CREATE TYPE "StemPart" AS ENUM ('VOCALS', 'BACKING_VOCALS', 'DRUMS', 'BASS', 'GUITAR', 'KEYS', 'OTHER', 'CLICK');

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "stemPart" "StemPart";
