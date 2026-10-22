CREATE TABLE IF NOT EXISTS "brief_sends" (
	"org_id" text NOT NULL,
	"member_id" text NOT NULL,
	"day" date NOT NULL,
	"slot" text NOT NULL,
	"channel" text NOT NULL,
	"text" text,
	"error" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brief_sends_org_id_member_id_day_slot_pk" PRIMARY KEY("org_id","member_id","day","slot")
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "brief_sends" ADD CONSTRAINT "brief_sends_member_fk" FOREIGN KEY ("org_id","member_id") REFERENCES "members"("org_id","id") DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "whatsapp_outbox" ADD COLUMN IF NOT EXISTS "last_error" text;
