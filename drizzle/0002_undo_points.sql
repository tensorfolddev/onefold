CREATE TABLE "undo_points" (
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"version" integer NOT NULL,
	"before" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "undo_points_org_id_user_id_pk" PRIMARY KEY("org_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "undo_points" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "company_rows" ON "undo_points" AS PERMISSIVE FOR ALL TO public USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));