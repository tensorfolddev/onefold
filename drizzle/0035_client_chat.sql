CREATE TABLE IF NOT EXISTS "chat_reads" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"person_id" text NOT NULL,
	"subject" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	CONSTRAINT "chat_reads_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
ALTER TABLE "chat_reads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "client_links" (
	"org_id" text NOT NULL,
	"member_id" text NOT NULL,
	"code_hash" text NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	CONSTRAINT "client_links_org_id_member_id_pk" PRIMARY KEY("org_id","member_id")
);
--> statement-breakpoint
ALTER TABLE "client_messages" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "client_messages" ADD COLUMN IF NOT EXISTS "hidden_for" jsonb;--> statement-breakpoint
ALTER TABLE "client_messages" ADD COLUMN IF NOT EXISTS "starred_by" jsonb;--> statement-breakpoint
ALTER TABLE "client_messages" ADD COLUMN IF NOT EXISTS "pinned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "client_messages" ADD COLUMN IF NOT EXISTS "pinned_by" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "client_phases" jsonb;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "requirement_priorities" jsonb;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_reads_subject" ON "chat_reads" USING btree ("org_id","subject");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "client_links_code" ON "client_links" USING btree ("code_hash");--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'chat_reads' AND policyname = 'company_rows') THEN CREATE POLICY "company_rows" ON "chat_reads" AS PERMISSIVE FOR ALL TO public USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true)); END IF; END $$;