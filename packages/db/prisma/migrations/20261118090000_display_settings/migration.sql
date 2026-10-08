-- Each mode's display settings (issue #209).
ALTER TABLE "User" ADD COLUMN "displaySettings" JSONB NOT NULL DEFAULT '{}';
