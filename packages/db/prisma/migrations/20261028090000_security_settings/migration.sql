-- How the API protects itself (issue #113): rate limits and API docs access.
CREATE TABLE "SecuritySettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "rateLimitEnabled" BOOLEAN,
    "rateLimitPerMinute" INTEGER,
    "rateLimitAnonymousPerMinute" INTEGER,
    "rateLimitHeavyPerMinute" INTEGER,
    "trustedProxies" INTEGER,
    "apiDocsPublic" BOOLEAN,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecuritySettings_pkey" PRIMARY KEY ("id")
);
