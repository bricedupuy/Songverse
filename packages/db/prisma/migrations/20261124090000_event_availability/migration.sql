-- Availability for a team's event dates (issue #235): each person's answer
-- for a date, and the days they're away across all their teams.
CREATE TYPE "AvailabilityAnswer" AS ENUM ('AVAILABLE', 'IF_NEEDED', 'UNAVAILABLE');

-- CreateTable
CREATE TABLE "TeamEventAnswer" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "userId" TEXT NOT NULL,
    "answer" "AvailabilityAnswer" NOT NULL,
    "note" TEXT,
    "answeredByUserId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamEventAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAway" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "from" DATE NOT NULL,
    "to" DATE NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAway_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeamEventAnswer_userId_idx" ON "TeamEventAnswer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamEventAnswer_eventId_date_userId_key" ON "TeamEventAnswer"("eventId", "date", "userId");

-- CreateIndex
CREATE INDEX "UserAway_userId_idx" ON "UserAway"("userId");

-- AddForeignKey
ALTER TABLE "TeamEventAnswer" ADD CONSTRAINT "TeamEventAnswer_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "TeamEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamEventAnswer" ADD CONSTRAINT "TeamEventAnswer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamEventAnswer" ADD CONSTRAINT "TeamEventAnswer_answeredByUserId_fkey" FOREIGN KEY ("answeredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAway" ADD CONSTRAINT "UserAway_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
