ALTER TABLE "decisions" ADD COLUMN IF NOT EXISTS "label_name" text;--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN IF NOT EXISTS "label_color" text;--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN IF NOT EXISTS "color" text;