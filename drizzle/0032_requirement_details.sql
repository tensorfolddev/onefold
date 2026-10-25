ALTER TABLE "requirements" ADD COLUMN IF NOT EXISTS "description" text;--> statement-breakpoint
ALTER TABLE "requirements" ADD COLUMN IF NOT EXISTS "criteria" jsonb;--> statement-breakpoint
ALTER TABLE "requirements" ADD COLUMN IF NOT EXISTS "status" text;--> statement-breakpoint
ALTER TABLE "requirements" ADD COLUMN IF NOT EXISTS "rev" integer;--> statement-breakpoint
ALTER TABLE "requirements" ADD COLUMN IF NOT EXISTS "confirmed" jsonb;--> statement-breakpoint
ALTER TABLE "requirements" ADD COLUMN IF NOT EXISTS "proposed_by" text;--> statement-breakpoint
ALTER TABLE "requirements" ADD COLUMN IF NOT EXISTS "dropped_reason" text;--> statement-breakpoint
ALTER TABLE "requirements" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "requirements" ADD COLUMN IF NOT EXISTS "created_by" text;--> statement-breakpoint
ALTER TABLE "requirements" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone;