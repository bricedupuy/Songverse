-- AlterTable
ALTER TABLE "Role" ADD COLUMN     "canUploadAudio" BOOLEAN NOT NULL DEFAULT false;

-- Uploading audio files is a role's (issue #183): a built-in one, given to
-- everyone who has an account now, so they keep what they could do. People
-- who sign up from now on don't get it.
INSERT INTO "Role" ("id", "name", "description", "builtIn", "canUploadAudio", "updatedAt")
VALUES ('role_audio_uploads', 'Audio uploads', 'Uploads audio files: recordings and stems.', 'AUDIO_UPLOADS', true, CURRENT_TIMESTAMP);

INSERT INTO "RoleAssignment" ("id", "roleId", "userId")
SELECT 'ra_' || md5('audio' || "id"), 'role_audio_uploads', "id" FROM "User";
