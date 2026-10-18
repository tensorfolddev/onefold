CREATE TABLE "doc_links" (
	"org_id" text NOT NULL,
	"doc_id" text NOT NULL,
	"kind" text NOT NULL,
	"target" text NOT NULL,
	CONSTRAINT "doc_links_org_id_doc_id_kind_target_pk" PRIMARY KEY("org_id","doc_id","kind","target")
);
--> statement-breakpoint
ALTER TABLE "doc_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "link_previews" (
	"url_hash" text PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"data" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "doc_links_target" ON "doc_links" USING btree ("org_id","kind","target");--> statement-breakpoint
CREATE POLICY "company_rows" ON "doc_links" AS PERMISSIVE FOR ALL TO public USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
ALTER TABLE doc_links ADD CONSTRAINT doc_links_doc_fk FOREIGN KEY (org_id, doc_id) REFERENCES docs (org_id, id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
