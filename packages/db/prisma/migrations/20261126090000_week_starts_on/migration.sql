-- Calendars' first day of the week (issue #235): 0 Sunday, 1 Monday, 6
-- Saturday; null takes the one of the person's language.
ALTER TABLE "User" ADD COLUMN "weekStartsOn" INTEGER;
