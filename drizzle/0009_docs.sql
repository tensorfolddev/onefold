CREATE TABLE "doc_bodies" (
	"org_id" text NOT NULL,
	"doc_id" text NOT NULL,
	"body" text NOT NULL,
	"rev" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "doc_bodies_org_id_doc_id_pk" PRIMARY KEY("org_id","doc_id")
);
--> statement-breakpoint
ALTER TABLE "doc_bodies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "doc_versions" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"doc_id" text NOT NULL,
	"rev" integer NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"author_id" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "doc_versions_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
ALTER TABLE "doc_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "docs" ALTER COLUMN "product_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "docs" ADD COLUMN IF NOT EXISTS "parent_id" text;--> statement-breakpoint
ALTER TABLE "docs" ADD COLUMN IF NOT EXISTS "icon" text;--> statement-breakpoint
ALTER TABLE "docs" ADD COLUMN IF NOT EXISTS "cover" text;--> statement-breakpoint
ALTER TABLE "docs" ADD COLUMN IF NOT EXISTS "template" text;--> statement-breakpoint
ALTER TABLE "docs" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "docs" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "docs" ADD COLUMN IF NOT EXISTS "updated_by" text;--> statement-breakpoint
ALTER TABLE "docs" ADD COLUMN IF NOT EXISTS "rev" integer;--> statement-breakpoint
ALTER TABLE "docs" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "docs" ADD COLUMN IF NOT EXISTS "archived_by" text;--> statement-breakpoint
CREATE INDEX "doc_versions_doc" ON "doc_versions" USING btree ("org_id","doc_id","at");--> statement-breakpoint
CREATE INDEX "docs_parent" ON "docs" USING btree ("org_id","parent_id");--> statement-breakpoint
CREATE POLICY "company_rows" ON "doc_bodies" AS PERMISSIVE FOR ALL TO public USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "company_rows" ON "doc_versions" AS PERMISSIVE FOR ALL TO public USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
-- A doc's body and versions go when the doc is deleted for good (deferred, like every company foreign key).
ALTER TABLE doc_bodies ADD CONSTRAINT doc_bodies_doc_fk FOREIGN KEY (org_id, doc_id) REFERENCES docs (org_id, id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE doc_versions ADD CONSTRAINT doc_versions_doc_fk FOREIGN KEY (org_id, doc_id) REFERENCES docs (org_id, id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
-- Full-text search over bodies ('simple': no language stemming, so any language works).
ALTER TABLE doc_bodies ADD COLUMN IF NOT EXISTS search tsvector GENERATED ALWAYS AS (to_tsvector('simple', body)) STORED;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS doc_bodies_search ON doc_bodies USING gin (search);
