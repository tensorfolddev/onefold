CREATE TABLE IF NOT EXISTS "client_asks" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"product_id" text NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"details" text NOT NULL,
	"kind" text NOT NULL,
	"invite" text,
	"assignee_id" text,
	"due" date,
	"state" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"answered_by" text,
	"answered_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	CONSTRAINT "client_asks_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
ALTER TABLE "client_asks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "client_messages" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"product_id" text NOT NULL,
	"subject" text NOT NULL,
	"author_id" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"body" text NOT NULL,
	"kind" text,
	"event" text,
	"rev" integer,
	"data" jsonb,
	"via" text,
	CONSTRAINT "client_messages_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
ALTER TABLE "client_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_clients" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"product_id" text NOT NULL,
	"member_id" text NOT NULL,
	"role" text NOT NULL,
	"position" double precision NOT NULL,
	CONSTRAINT "product_clients_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
ALTER TABLE "product_clients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "email_tokens" ADD COLUMN IF NOT EXISTS "org_id" text;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "client_company" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "client_space" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "requirements" ADD COLUMN IF NOT EXISTS "shared_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'team' NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_asks_product" ON "client_asks" USING btree ("org_id","product_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_messages_subject" ON "client_messages" USING btree ("org_id","subject");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_clients_member" ON "product_clients" USING btree ("org_id","member_id");--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'client_asks' AND policyname = 'company_rows') THEN CREATE POLICY "company_rows" ON "client_asks" AS PERMISSIVE FOR ALL TO public USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true)); END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'client_messages' AND policyname = 'company_rows') THEN CREATE POLICY "company_rows" ON "client_messages" AS PERMISSIVE FOR ALL TO public USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true)); END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'product_clients' AND policyname = 'company_rows') THEN CREATE POLICY "company_rows" ON "product_clients" AS PERMISSIVE FOR ALL TO public USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true)); END IF; END $$;