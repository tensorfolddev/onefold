ALTER TABLE "requirements" ADD COLUMN IF NOT EXISTS "priority" text;--> statement-breakpoint
ALTER TABLE "requirements" ADD COLUMN IF NOT EXISTS "source_kind" text;--> statement-breakpoint
ALTER TABLE "requirements" ADD COLUMN IF NOT EXISTS "source_note" text;