ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "archived_by" text;