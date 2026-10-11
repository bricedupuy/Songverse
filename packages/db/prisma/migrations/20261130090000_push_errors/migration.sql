-- Why the last push to a device failed (issue #237).
ALTER TABLE "PushSubscription" ADD COLUMN "lastError" TEXT,
ADD COLUMN "lastErrorAt" TIMESTAMP(3);
