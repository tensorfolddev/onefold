ALTER TABLE "decisions" ADD COLUMN IF NOT EXISTS "status" text;--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN IF NOT EXISTS "context" text;--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN IF NOT EXISTS "alternatives" text;--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN IF NOT EXISTS "consequences" text;--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN IF NOT EXISTS "ticket_keys" jsonb;--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN IF NOT EXISTS "doc_ids" jsonb;--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN IF NOT EXISTS "superseded_by" text;--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone;