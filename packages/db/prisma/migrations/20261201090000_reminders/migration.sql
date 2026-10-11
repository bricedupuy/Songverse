-- Reminders (issue #235): answers asked for by a deadline, the day before a date, a set ready.
ALTER TABLE "TeamEventDate" ADD COLUMN "setReadyAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TeamEventReminder" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamEventReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamAnswerRequest" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "from" DATE NOT NULL,
    "to" DATE NOT NULL,
    "deadline" DATE NOT NULL,
    "timeZone" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "remindedAt" TIMESTAMP(3),

    CONSTRAINT "TeamAnswerRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeamEventReminder_eventId_date_kind_key" ON "TeamEventReminder"("eventId", "date", "kind");

-- CreateIndex
CREATE INDEX "TeamAnswerRequest_teamId_idx" ON "TeamAnswerRequest"("teamId");

-- AddForeignKey
ALTER TABLE "TeamEventReminder" ADD CONSTRAINT "TeamEventReminder_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "TeamEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamAnswerRequest" ADD CONSTRAINT "TeamAnswerRequest_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamAnswerRequest" ADD CONSTRAINT "TeamAnswerRequest_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
