CREATE TABLE IF NOT EXISTS "company_email" (
	"org_id" text NOT NULL,
	"api_key" text NOT NULL,
	"key_hint" text NOT NULL,
	"from_address" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "company_email_org_id_pk" PRIMARY KEY("org_id")
);
--> statement-breakpoint
ALTER TABLE "company_email" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY "company_rows" ON "company_email" AS PERMISSIVE FOR ALL TO public USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;