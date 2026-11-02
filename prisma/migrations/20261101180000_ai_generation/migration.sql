-- CreateEnum
CREATE TYPE "GenerationKind" AS ENUM ('INITIAL_PLAN', 'ADAPT_CURRENT', 'REVISE_FUTURE');

-- CreateEnum
CREATE TYPE "GenerationStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REJECTED', 'STALE');

-- AlterTable
ALTER TABLE "Level" ADD COLUMN     "prerequisitesJson" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "stableKey" TEXT;

-- CreateTable
CREATE TABLE "GenerationJob" (
    "id" UUID NOT NULL,
    "puppyId" UUID NOT NULL,
    "kind" "GenerationKind" NOT NULL,
    "status" "GenerationStatus" NOT NULL DEFAULT 'PENDING',
    "expectedRevision" INTEGER NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "latencyMs" INTEGER,
    "errorCode" TEXT,
    "payloadJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "GenerationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsageDay" (
    "key" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "AiUsageDay_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'TEST',
    "isTestFixture" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GenerationJob_puppyId_createdAt_idx" ON "GenerationJob"("puppyId", "createdAt");

-- CreateIndex
CREATE INDEX "AiUsageDay_day_idx" ON "AiUsageDay"("day");

-- CreateIndex
CREATE UNIQUE INDEX "Level_planId_stableKey_key" ON "Level"("planId", "stableKey");

-- AddForeignKey
ALTER TABLE "ExerciseVersion" ADD CONSTRAINT "ExerciseVersion_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationJob" ADD CONSTRAINT "GenerationJob_puppyId_fkey" FOREIGN KEY ("puppyId") REFERENCES "Puppy"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- One pending generation per puppy (the pending-job control of Phase 2).
CREATE UNIQUE INDEX "GenerationJob_one_pending_per_puppy" ON "GenerationJob"("puppyId") WHERE "status" = 'PENDING';

ALTER TABLE "AiUsageDay" ADD CONSTRAINT "AiUsageDay_count_positive" CHECK ("count" >= 1);

-- Keep the public Data API closed for the new tables (see 20261101120000_lock_public_data_api).
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM authenticated;
  END IF;
END
$$;
