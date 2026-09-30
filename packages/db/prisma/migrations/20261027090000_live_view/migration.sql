-- How songs read in Live unless chosen for a song (issue #155).
CREATE TYPE "LiveView" AS ENUM ('CHART', 'PDF');

ALTER TABLE "User" ADD COLUMN "liveView" "LiveView" NOT NULL DEFAULT 'CHART';
