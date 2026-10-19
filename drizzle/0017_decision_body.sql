CREATE TABLE IF NOT EXISTS "decision_files" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"decision_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"size" integer NOT NULL,
	"uploaded_by" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "decision_files_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
ALTER TABLE "decision_files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN IF NOT EXISTS "body" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "decision_files_decision" ON "decision_files" USING btree ("org_id","decision_id");--> statement-breakpoint
CREATE POLICY "company_rows" ON "decision_files" AS PERMISSIVE FOR ALL TO public USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
ALTER TABLE decision_files ADD CONSTRAINT decision_files_decision_fk FOREIGN KEY (org_id, decision_id) REFERENCES decisions (org_id, id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
