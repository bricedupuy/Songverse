-- What happens after a song of a set (issue #199).
CREATE TYPE "SetTransition" AS ENUM ('STOP', 'NEXT', 'SEGUE', 'TRANSITION');

ALTER TABLE "SetlistItem" ADD COLUMN "transition" "SetTransition",
ADD COLUMN "transitionNote" TEXT;
