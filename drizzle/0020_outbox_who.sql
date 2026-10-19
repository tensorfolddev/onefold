ALTER TABLE "whatsapp_outbox" ADD COLUMN IF NOT EXISTS "org_id" text;--> statement-breakpoint
ALTER TABLE "whatsapp_outbox" ADD COLUMN IF NOT EXISTS "member_id" text;--> statement-breakpoint
ALTER TABLE "whatsapp_outbox" ADD COLUMN IF NOT EXISTS "kind" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "whatsapp_outbox_org" ON "whatsapp_outbox" USING btree ("org_id","id");