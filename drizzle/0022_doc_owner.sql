ALTER TABLE "docs" ADD COLUMN IF NOT EXISTS "owner_id" text;--> statement-breakpoint
ALTER TABLE "docs" ADD COLUMN IF NOT EXISTS "shared_with" jsonb;--> statement-breakpoint
ALTER TABLE "docs" ADD COLUMN IF NOT EXISTS "company_access" text;