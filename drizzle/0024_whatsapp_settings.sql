CREATE TABLE IF NOT EXISTS "whatsapp_settings" (
	"org_id" text PRIMARY KEY NOT NULL,
	"brief_on" boolean DEFAULT true NOT NULL,
	"brief_at" text DEFAULT '09:00' NOT NULL,
	"brief_days" jsonb NOT NULL,
	"words" jsonb NOT NULL,
	"templates" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
