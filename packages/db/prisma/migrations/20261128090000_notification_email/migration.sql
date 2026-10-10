-- Notifications by email (issue #236): when each went, and the server's switch.
ALTER TABLE "Notification" ADD COLUMN "emailedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "NotificationSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "emailEnabled" BOOLEAN,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationSettings_pkey" PRIMARY KEY ("id")
);
