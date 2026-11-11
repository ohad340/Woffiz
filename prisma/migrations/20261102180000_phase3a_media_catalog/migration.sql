-- CreateEnum
CREATE TYPE "MediaVariant" AS ENUM ('STANDARD', 'EASIER');

-- CreateEnum
CREATE TYPE "MediaVersionStatus" AS ENUM ('DRAFT', 'REVIEWED', 'PUBLISHED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "MediaReviewKind" AS ENUM ('TECHNICAL', 'CONTENT');

-- CreateEnum
CREATE TYPE "ReviewDecision" AS ENUM ('APPROVED', 'CHANGES_REQUESTED');

-- CreateEnum
CREATE TYPE "WithdrawReason" AS ENUM ('SUPERSEDED', 'TECHNICAL', 'SAFETY');

-- CreateEnum
CREATE TYPE "SuspensionAction" AS ENUM ('SUSPEND', 'LIFT');

-- AlterTable
ALTER TABLE "ExerciseVersion" ADD COLUMN     "techniqueKey" TEXT,
ADD COLUMN     "techniqueParamsJson" JSONB,
ADD COLUMN     "techniqueVariant" "MediaVariant",
ADD COLUMN     "techniqueVersion" INTEGER;

-- AlterTable
ALTER TABLE "MediaAsset" ADD COLUMN     "techniqueKey" TEXT,
ADD COLUMN     "techniqueVersion" INTEGER;

-- CreateTable
CREATE TABLE "TechniqueVersionState" (
    "techniqueKey" TEXT NOT NULL,
    "techniqueVersion" INTEGER NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "suspendedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TechniqueVersionState_pkey" PRIMARY KEY ("techniqueKey","techniqueVersion")
);

-- CreateTable
CREATE TABLE "TechniqueSuspensionEvent" (
    "id" UUID NOT NULL,
    "techniqueKey" TEXT NOT NULL,
    "techniqueVersion" INTEGER NOT NULL,
    "action" "SuspensionAction" NOT NULL,
    "note" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TechniqueSuspensionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaVersion" (
    "id" UUID NOT NULL,
    "assetId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "MediaVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "techniqueKey" TEXT NOT NULL,
    "techniqueVersion" INTEGER NOT NULL,
    "variant" "MediaVariant" NOT NULL,
    "techniqueFingerprint" TEXT NOT NULL,
    "videoKey" TEXT NOT NULL,
    "posterKey" TEXT NOT NULL,
    "videoSha256" TEXT NOT NULL,
    "posterSha256" TEXT NOT NULL,
    "captionsSha256" TEXT NOT NULL,
    "transcriptSha256" TEXT NOT NULL,
    "bundleFingerprint" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "hasAudio" BOOLEAN NOT NULL,
    "captionsVtt" TEXT NOT NULL,
    "transcriptJson" JSONB NOT NULL,
    "timelineJson" JSONB NOT NULL,
    "voiceJson" JSONB NOT NULL,
    "demonstratedParamsJson" JSONB NOT NULL,
    "productionJson" JSONB NOT NULL,
    "isTestFixture" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "withdrawnAt" TIMESTAMP(3),
    "withdrawnById" TEXT,
    "withdrawReason" "WithdrawReason",
    "withdrawNote" TEXT,

    CONSTRAINT "MediaVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaReview" (
    "id" UUID NOT NULL,
    "mediaVersionId" UUID NOT NULL,
    "kind" "MediaReviewKind" NOT NULL,
    "decision" "ReviewDecision" NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "reviewedFingerprint" TEXT NOT NULL,
    "checklistJson" JSONB NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TechniqueSuspensionEvent_techniqueKey_techniqueVersion_crea_idx" ON "TechniqueSuspensionEvent"("techniqueKey", "techniqueVersion", "createdAt");

-- CreateIndex
CREATE INDEX "MediaVersion_techniqueKey_techniqueVersion_status_idx" ON "MediaVersion"("techniqueKey", "techniqueVersion", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MediaVersion_assetId_version_key" ON "MediaVersion"("assetId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "MediaVersion_assetId_bundleFingerprint_key" ON "MediaVersion"("assetId", "bundleFingerprint");

-- CreateIndex
CREATE INDEX "MediaReview_mediaVersionId_kind_createdAt_idx" ON "MediaReview"("mediaVersionId", "kind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_techniqueKey_techniqueVersion_variant_key" ON "MediaAsset"("techniqueKey", "techniqueVersion", "variant");

-- AddForeignKey
ALTER TABLE "ExerciseVersion" ADD CONSTRAINT "ExerciseVersion_techniqueKey_techniqueVersion_fkey" FOREIGN KEY ("techniqueKey", "techniqueVersion") REFERENCES "TechniqueVersionState"("techniqueKey", "techniqueVersion") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaVersion" ADD CONSTRAINT "MediaVersion_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaReview" ADD CONSTRAINT "MediaReview_mediaVersionId_fkey" FOREIGN KEY ("mediaVersionId") REFERENCES "MediaVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- ===== Phase 3A integrity rules (hand-written; see docs/PHASE_3_PLAN.md) =====

-- One PUBLISHED version per slot, enforced by the database, whatever the application does.
CREATE UNIQUE INDEX "MediaVersion_one_published_per_asset" ON "MediaVersion"("assetId") WHERE "status" = 'PUBLISHED';

-- Fixture clips live under fixtures/, production clips under v/. A production clip must carry audio (Hebrew voice guidance).
ALTER TABLE "MediaVersion" ADD CONSTRAINT "MediaVersion_storage_keys" CHECK (
  ("isTestFixture" AND "videoKey" LIKE 'fixtures/%' AND "posterKey" LIKE 'fixtures/%')
  OR (NOT "isTestFixture" AND "videoKey" LIKE 'v/%' AND "posterKey" LIKE 'v/%')
);
ALTER TABLE "MediaVersion" ADD CONSTRAINT "MediaVersion_production_has_audio" CHECK ("isTestFixture" OR "hasAudio");
ALTER TABLE "MediaVersion" ADD CONSTRAINT "MediaVersion_sizes_positive" CHECK ("bytes" > 0 AND "width" > 0 AND "height" > 0 AND "durationMs" > 0 AND "version" >= 1);
ALTER TABLE "MediaVersion" ADD CONSTRAINT "MediaVersion_lifecycle_fields" CHECK (
  ("status" NOT IN ('REVIEWED', 'PUBLISHED') OR "reviewedAt" IS NOT NULL)
  AND ("status" <> 'PUBLISHED' OR ("publishedAt" IS NOT NULL AND "publishedById" IS NOT NULL))
  AND ("status" <> 'WITHDRAWN' OR ("withdrawnAt" IS NOT NULL AND "withdrawnById" IS NOT NULL AND "withdrawReason" IS NOT NULL))
);
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_variant_values" CHECK ("variant" IN ('STANDARD', 'EASIER'));

-- Content is immutable. Only the lifecycle columns may change, and only along DRAFT -> REVIEWED -> PUBLISHED -> WITHDRAWN
-- (DRAFT or REVIEWED may also be withdrawn). Rows are never deleted.
CREATE FUNCTION "media_version_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  lifecycle text[] := ARRAY['status', 'reviewedAt', 'publishedAt', 'publishedById', 'withdrawnAt', 'withdrawnById', 'withdrawReason', 'withdrawNote'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'MediaVersion rows are never deleted';
  END IF;
  IF (to_jsonb(NEW) - lifecycle) IS DISTINCT FROM (to_jsonb(OLD) - lifecycle) THEN
    RAISE EXCEPTION 'MediaVersion content is immutable: create a new version';
  END IF;
  IF NEW."status" = OLD."status" THEN
    IF to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
      RAISE EXCEPTION 'MediaVersion lifecycle fields change only together with a status move';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT (
    (OLD."status" = 'DRAFT' AND NEW."status" IN ('REVIEWED', 'WITHDRAWN'))
    OR (OLD."status" = 'REVIEWED' AND NEW."status" IN ('PUBLISHED', 'WITHDRAWN'))
    OR (OLD."status" = 'PUBLISHED' AND NEW."status" = 'WITHDRAWN')
  ) THEN
    RAISE EXCEPTION 'MediaVersion status move % -> % is not allowed', OLD."status", NEW."status";
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER "MediaVersion_guard" BEFORE UPDATE OR DELETE ON "MediaVersion" FOR EACH ROW EXECUTE FUNCTION "media_version_guard"();

-- Reviews and suspension history are append-only.
CREATE FUNCTION "append_only_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME;
END
$$;
CREATE TRIGGER "MediaReview_append_only" BEFORE UPDATE OR DELETE ON "MediaReview" FOR EACH ROW EXECUTE FUNCTION "append_only_guard"();
CREATE TRIGGER "TechniqueSuspensionEvent_append_only" BEFORE UPDATE OR DELETE ON "TechniqueSuspensionEvent" FOR EACH ROW EXECUTE FUNCTION "append_only_guard"();

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
