-- A team's calendar (issue #235): events, one-off or repeating, and the
-- dates with something of their own (changed, or given their set).
ALTER TABLE "Team" ADD COLUMN "setsAheadWeeks" INTEGER NOT NULL DEFAULT 4;

-- CreateTable
CREATE TABLE "TeamEvent" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 90,
    "timeZone" TEXT NOT NULL,
    "place" TEXT,
    "note" TEXT,
    "repeatEveryWeeks" INTEGER,
    "repeatUntil" DATE,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamEventDate" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "startTime" TEXT,
    "title" TEXT,
    "setlistId" TEXT,
    "setCreatedAt" TIMESTAMP(3),

    CONSTRAINT "TeamEventDate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeamEvent_teamId_idx" ON "TeamEvent"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamEventDate_setlistId_key" ON "TeamEventDate"("setlistId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamEventDate_eventId_date_key" ON "TeamEventDate"("eventId", "date");

-- AddForeignKey
ALTER TABLE "TeamEvent" ADD CONSTRAINT "TeamEvent_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamEvent" ADD CONSTRAINT "TeamEvent_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamEventDate" ADD CONSTRAINT "TeamEventDate_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "TeamEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamEventDate" ADD CONSTRAINT "TeamEventDate_setlistId_fkey" FOREIGN KEY ("setlistId") REFERENCES "Setlist"("id") ON DELETE SET NULL ON UPDATE CASCADE;
