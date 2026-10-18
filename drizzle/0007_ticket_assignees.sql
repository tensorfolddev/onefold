ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "assignee_ids" text[];--> statement-breakpoint
UPDATE "tickets" SET "assignee_ids" = ARRAY["assignee_id"] WHERE "assignee_id" IS NOT NULL AND "assignee_ids" IS NULL;
