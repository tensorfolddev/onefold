CREATE TABLE IF NOT EXISTS "company_bots" (
	"org_id" text PRIMARY KEY NOT NULL,
	"state" text DEFAULT 'off' NOT NULL,
	"qr" text,
	"phone" text,
	"request" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
