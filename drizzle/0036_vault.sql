CREATE TABLE IF NOT EXISTS "vault_accounts" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"salt" text NOT NULL,
	"iterations" integer NOT NULL,
	"iv" text NOT NULL,
	"wrapped_private_key" text NOT NULL,
	"public_key" text NOT NULL,
	"recovery_salt" text NOT NULL,
	"recovery_iv" text NOT NULL,
	"recovery_wrapped_private_key" text NOT NULL,
	CONSTRAINT "vault_accounts_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
ALTER TABLE "vault_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vault_items" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"vault_id" text NOT NULL,
	"iv" text NOT NULL,
	"ciphertext" text NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "vault_items_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
ALTER TABLE "vault_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vaults" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"kind" text NOT NULL,
	"owner_id" text,
	"keys" jsonb NOT NULL,
	"invited" jsonb,
	"created_by" text NOT NULL,
	"created_at" date NOT NULL,
	CONSTRAINT "vaults_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
ALTER TABLE "vaults" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vault_items_vault" ON "vault_items" USING btree ("org_id","vault_id");--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vault_accounts' AND policyname = 'company_rows') THEN CREATE POLICY "company_rows" ON "vault_accounts" AS PERMISSIVE FOR ALL TO public USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true)); END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vault_items' AND policyname = 'company_rows') THEN CREATE POLICY "company_rows" ON "vault_items" AS PERMISSIVE FOR ALL TO public USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true)); END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vaults' AND policyname = 'company_rows') THEN CREATE POLICY "company_rows" ON "vaults" AS PERMISSIVE FOR ALL TO public USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true)); END IF; END $$;