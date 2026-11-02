-- Leases, a fencing token and refund-once bookkeeping for generation jobs (Phase 2 hardening).
--
-- A job is owned by the worker that holds its current "generation" while "leaseExpiresAt" is in the future.
-- Reclaiming an expired job increments "generation", so a worker that lost ownership can never commit a result.
-- "quotaChargedDay" / "quotaRefundedAt" let the account's request unit be given back at most once.
-- The columns are added nullable and backfilled first, so the migration also works on a table that has rows.

ALTER TABLE "GenerationJob"
  ADD COLUMN "generation" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "ownerId" TEXT,
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "leaseExpiresAt" TIMESTAMP(3),
  ADD COLUMN "quotaChargedDay" DATE,
  ADD COLUMN "quotaRefundedAt" TIMESTAMP(3);

-- Rows from before the leases (none exist on a fresh deployment): attribute them to the puppy's owner, give them a
-- unique key, and treat them as expired. They were never charged to a counter day, so they can never be refunded.
UPDATE "GenerationJob" AS j
SET "ownerId" = p."ownerId",
    "idempotencyKey" = 'legacy-' || j."id"::text,
    "leaseExpiresAt" = j."createdAt"
FROM "Puppy" AS p
WHERE p."id" = j."puppyId";

ALTER TABLE "GenerationJob"
  ALTER COLUMN "ownerId" SET NOT NULL,
  ALTER COLUMN "idempotencyKey" SET NOT NULL,
  ALTER COLUMN "leaseExpiresAt" SET NOT NULL;

CREATE INDEX "GenerationJob_ownerId_idempotencyKey_idx" ON "GenerationJob"("ownerId", "idempotencyKey");

-- The fencing token starts at 1 and only grows.
ALTER TABLE "GenerationJob" ADD CONSTRAINT "GenerationJob_generation_positive" CHECK ("generation" >= 1);
