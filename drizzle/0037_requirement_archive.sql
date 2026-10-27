ALTER TABLE "requirements" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "requirements" ADD COLUMN IF NOT EXISTS "archived_by" text;
