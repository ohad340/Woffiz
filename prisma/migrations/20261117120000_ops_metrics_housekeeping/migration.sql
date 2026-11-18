-- CreateEnum
CREATE TYPE "OpsEventKind" AS ENUM ('SERVER_ERROR', 'AUTH_EMAIL_FAILED', 'HOUSEKEEPING_FAILED');

-- CreateEnum
CREATE TYPE "OpsAlertRule" AS ENUM ('server-errors', 'auth-email', 'generation-failures', 'ai-budget-warning', 'ai-budget-exhausted', 'housekeeping');

-- CreateEnum
CREATE TYPE "OpsNotifyStatus" AS ENUM ('SENT', 'FAILED', 'SKIPPED', 'SUPPRESSED', 'NOT_CONFIGURED', 'GAVE_UP');

-- CreateEnum
CREATE TYPE "HousekeepingTrigger" AS ENUM ('CRON', 'MANUAL');

-- CreateTable
CREATE TABLE "OpsEvent" (
    "id" UUID NOT NULL,
    "kind" "OpsEventKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsAlert" (
    "id" UUID NOT NULL,
    "rule" "OpsAlertRule" NOT NULL,
    "dedupKey" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastEventAt" TIMESTAMP(3) NOT NULL,
    "eventCount" INTEGER NOT NULL,
    "lastNotifiedAt" TIMESTAMP(3),
    "notifyStatus" "OpsNotifyStatus",
    "notifyAttempts" INTEGER NOT NULL DEFAULT 0,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "OpsAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HousekeepingRun" (
    "id" UUID NOT NULL,
    "trigger" "HousekeepingTrigger" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "stepsJson" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "HousekeepingRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PilotMetricDay" (
    "day" DATE NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metricsJson" JSONB NOT NULL,

    CONSTRAINT "PilotMetricDay_pkey" PRIMARY KEY ("day")
);

-- CreateIndex
CREATE INDEX "OpsEvent_kind_createdAt_idx" ON "OpsEvent"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "OpsAlert_resolvedAt_openedAt_idx" ON "OpsAlert"("resolvedAt", "openedAt");

-- CreateIndex
CREATE INDEX "HousekeepingRun_startedAt_idx" ON "HousekeepingRun"("startedAt");


-- At most one OPEN alert per dedupKey (Prisma cannot express partial unique indexes). Opening an alert is a single
-- INSERT ... ON CONFLICT DO NOTHING RETURNING, so across server instances only the inserter notifies.
CREATE UNIQUE INDEX "OpsAlert_one_open_per_key" ON "OpsAlert" ("dedupKey") WHERE "resolvedAt" IS NULL;

-- At most one unfinished housekeeping run (the run lease).
CREATE UNIQUE INDEX "HousekeepingRun_one_unfinished" ON "HousekeepingRun" ((true)) WHERE "finishedAt" IS NULL;

-- Keep the public Data API closed for the new tables (see 20261101120000_lock_public_data_api).
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;

  -- These roles exist on Supabase only.
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
