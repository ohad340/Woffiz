-- At most one ACTIVE plan per puppy (Prisma cannot express partial unique indexes).
CREATE UNIQUE INDEX "Plan_one_active_per_puppy" ON "Plan" ("puppyId") WHERE "status" = 'ACTIVE';

-- Exactly one CURRENT level per plan. LOCKED/COMPLETED rows are unrestricted.
CREATE UNIQUE INDEX "Level_one_current_per_plan" ON "Level" ("planId") WHERE "state" = 'CURRENT';

-- Positions start at 1.
ALTER TABLE "Level" ADD CONSTRAINT "Level_position_positive" CHECK ("position" >= 1);
