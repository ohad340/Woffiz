-- CreateTable
CREATE TABLE "EmailRateLimit" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "EmailRateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "EmailRateLimit_windowStart_idx" ON "EmailRateLimit"("windowStart");

-- Counts start at 1.
ALTER TABLE "EmailRateLimit" ADD CONSTRAINT "EmailRateLimit_count_positive" CHECK ("count" >= 1);
