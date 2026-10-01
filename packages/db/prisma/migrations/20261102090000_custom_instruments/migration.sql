-- CreateTable
CREATE TABLE "CustomInstrument" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "translations" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomInstrument_pkey" PRIMARY KEY ("id")
);
