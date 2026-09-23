-- CreateTable
CREATE TABLE "AuthSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "resendApiKeyEnc" TEXT,
    "emailFrom" TEXT,
    "googleClientId" TEXT,
    "googleClientSecretEnc" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthSettings_pkey" PRIMARY KEY ("id")
);
