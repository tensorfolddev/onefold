CREATE TABLE "whatsapp_outbox" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"jid" text NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX "whatsapp_outbox_pending" ON "whatsapp_outbox" USING btree ("sent_at","id");