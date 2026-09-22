-- CreateTable
CREATE TABLE "StorageSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "r2AccountId" TEXT,
    "r2AccessKeyId" TEXT,
    "r2SecretAccessKeyEnc" TEXT,
    "r2Bucket" TEXT,
    "r2Endpoint" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorageSettings_pkey" PRIMARY KEY ("id")
);
