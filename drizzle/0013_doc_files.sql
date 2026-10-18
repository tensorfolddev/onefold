CREATE TABLE "doc_files" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"doc_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"size" integer NOT NULL,
	"uploaded_by" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "doc_files_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
ALTER TABLE "doc_files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "doc_files_doc" ON "doc_files" USING btree ("org_id","doc_id");--> statement-breakpoint
CREATE POLICY "company_rows" ON "doc_files" AS PERMISSIVE FOR ALL TO public USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
ALTER TABLE doc_files ADD CONSTRAINT doc_files_doc_fk FOREIGN KEY (org_id, doc_id) REFERENCES docs (org_id, id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
