CREATE TABLE IF NOT EXISTS "company_drive" (
	"org_id" text PRIMARY KEY NOT NULL,
	"refresh_token" text NOT NULL,
	"account_email" text NOT NULL,
	"folder_id" text,
	"connected_by" text,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"running_since" timestamp with time zone,
	"last_ok_at" timestamp with time zone,
	"last_error" text,
	"last_bytes" bigint
);
