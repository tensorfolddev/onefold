CREATE TABLE "doc_groups" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"product_id" text,
	"name" text NOT NULL,
	"position" double precision NOT NULL,
	CONSTRAINT "doc_groups_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
ALTER TABLE "docs" ADD COLUMN IF NOT EXISTS "group_id" text;