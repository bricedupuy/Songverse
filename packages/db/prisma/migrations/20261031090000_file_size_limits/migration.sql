-- The largest song file of each type (issue #163), set in Admin > Storage.
ALTER TABLE "StorageSettings" ADD COLUMN "fileSizeLimitsMb" JSONB;
