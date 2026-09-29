-- Parts named freely, and the sung harmonies (issue #131).
ALTER TYPE "StemPart" ADD VALUE 'HARMONY_SOPRANO';
ALTER TYPE "StemPart" ADD VALUE 'HARMONY_ALTO';
ALTER TYPE "StemPart" ADD VALUE 'HARMONY_TENOR';
ALTER TYPE "StemPart" ADD VALUE 'HARMONY_BASS';

ALTER TABLE "Attachment" ADD COLUMN "partName" TEXT;
