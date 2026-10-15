CREATE TABLE "brief_deliveries" (
	"org_id" text NOT NULL,
	"member_id" text NOT NULL,
	"day" date NOT NULL,
	"channel" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brief_deliveries_org_id_member_id_day_pk" PRIMARY KEY("org_id","member_id","day")
);
--> statement-breakpoint
CREATE TABLE "whatsapp_bot" (
	"id" integer PRIMARY KEY NOT NULL,
	"state" text NOT NULL,
	"qr" text,
	"phone" text,
	"request" text,
	"alerted_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_link_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"member_id" text NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "whatsapp_links" (
	"org_id" text NOT NULL,
	"member_id" text NOT NULL,
	"user_id" text NOT NULL,
	"jid" text NOT NULL,
	"phone" text NOT NULL,
	"briefs" boolean DEFAULT true NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_links_org_id_member_id_pk" PRIMARY KEY("org_id","member_id")
);
--> statement-breakpoint
ALTER TABLE "whatsapp_link_codes" ADD CONSTRAINT "whatsapp_link_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_links" ADD CONSTRAINT "whatsapp_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "whatsapp_links_jid" ON "whatsapp_links" USING btree ("jid");--> statement-breakpoint
ALTER TABLE "whatsapp_links" ADD CONSTRAINT "whatsapp_links_member_fk" FOREIGN KEY ("org_id","member_id") REFERENCES "members"("org_id","id") DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "whatsapp_link_codes" ADD CONSTRAINT "whatsapp_link_codes_member_fk" FOREIGN KEY ("org_id","member_id") REFERENCES "members"("org_id","id") DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "brief_deliveries" ADD CONSTRAINT "brief_deliveries_member_fk" FOREIGN KEY ("org_id","member_id") REFERENCES "members"("org_id","id") DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
INSERT INTO "whatsapp_bot" ("id", "state") VALUES (1, 'off');
