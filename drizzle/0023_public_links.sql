CREATE TABLE IF NOT EXISTS "public_links" (
	"token" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"doc_id" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "docs" ADD COLUMN IF NOT EXISTS "is_public" boolean;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "public_links_doc" ON "public_links" USING btree ("org_id","doc_id");