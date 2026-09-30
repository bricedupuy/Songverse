-- The web app's Content-Security-Policy mode (issue #114).
ALTER TABLE "SecuritySettings" ADD COLUMN "contentSecurityPolicy" TEXT;
