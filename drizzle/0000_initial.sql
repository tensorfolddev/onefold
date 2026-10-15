CREATE TABLE "activity" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"ticket_id" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"actor_id" text NOT NULL,
	"field" text NOT NULL,
	"from_value" text,
	"to_value" text NOT NULL,
	CONSTRAINT "activity_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"ticket_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"size" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"added_by" text NOT NULL,
	"added_at" timestamp with time zone NOT NULL,
	"position" double precision NOT NULL,
	CONSTRAINT "attachments_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"actor_id" text,
	"user_id" text,
	"source" text NOT NULL,
	"command" text NOT NULL,
	"args" jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "board_lists" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"product_id" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"tone" text NOT NULL,
	"system" text,
	"position" double precision NOT NULL,
	CONSTRAINT "board_lists_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"ticket_id" text NOT NULL,
	"author_id" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"body" text NOT NULL,
	CONSTRAINT "comments_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"product_id" text NOT NULL,
	"title" text NOT NULL,
	"why" text NOT NULL,
	"by_id" text NOT NULL,
	"date" date NOT NULL,
	"position" double precision NOT NULL,
	CONSTRAINT "decisions_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "docs" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"product_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"updated" date NOT NULL,
	"author_id" text NOT NULL,
	"position" double precision NOT NULL,
	CONSTRAINT "docs_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"token_hash" text NOT NULL,
	"email" text NOT NULL,
	"panel" text NOT NULL,
	"role" text NOT NULL,
	"invited_by" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"position" double precision NOT NULL,
	CONSTRAINT "invites_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "job_titles" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"position" double precision NOT NULL,
	CONSTRAINT "job_titles_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "members" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"role" text NOT NULL,
	"team" text NOT NULL,
	"capacity_h" double precision NOT NULL,
	"panel" text,
	"active" boolean NOT NULL,
	"position" double precision NOT NULL,
	CONSTRAINT "members_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "milestones" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"product_id" text NOT NULL,
	"name" text NOT NULL,
	"due" date NOT NULL,
	"pct" double precision NOT NULL,
	"late_days" integer NOT NULL,
	"position" double precision NOT NULL,
	CONSTRAINT "milestones_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"person_id" text NOT NULL,
	"kind" text NOT NULL,
	"actor_id" text NOT NULL,
	"text" text NOT NULL,
	"target" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"read" boolean NOT NULL,
	CONSTRAINT "notifications_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "orgs" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"email_domain" text NOT NULL,
	"domain_lock" boolean NOT NULL,
	"timezone" text DEFAULT 'Asia/Karachi' NOT NULL,
	"created_at" date NOT NULL,
	"created_by" text NOT NULL,
	"version" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_groups" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"position" double precision NOT NULL,
	CONSTRAINT "product_groups_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "product_members" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"product_id" text NOT NULL,
	"member_id" text NOT NULL,
	"position" double precision NOT NULL,
	CONSTRAINT "product_members_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"client" text,
	"stage" text NOT NULL,
	"health" text NOT NULL,
	"pm_id" text NOT NULL,
	"project_manager_id" text NOT NULL,
	"color" text NOT NULL,
	"description" text NOT NULL,
	"waiting_approval" text,
	"icon" jsonb,
	"group_id" text,
	"created_at" date NOT NULL,
	"position" double precision NOT NULL,
	CONSTRAINT "products_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "requirements" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"product_id" text NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"position" double precision NOT NULL,
	CONSTRAINT "requirements_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"org_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "stage_requests" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"product_id" text NOT NULL,
	"stage" text NOT NULL,
	"requested_by" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	CONSTRAINT "stage_requests_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"lead_id" text,
	"position" double precision NOT NULL,
	CONSTRAINT "teams_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "ticket_dependencies" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"ticket_id" text NOT NULL,
	"depends_on_id" text NOT NULL,
	"position" double precision NOT NULL,
	CONSTRAINT "ticket_dependencies_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"product_id" text NOT NULL,
	"title" text NOT NULL,
	"type" text NOT NULL,
	"status_id" text NOT NULL,
	"assignee_id" text,
	"priority" text NOT NULL,
	"estimate_h" double precision NOT NULL,
	"due" date,
	"requirement_id" text,
	"sprint" text,
	"pr" jsonb,
	"created_by" text,
	"color" text,
	"epic_id" text,
	"sections" jsonb,
	"position" double precision NOT NULL,
	CONSTRAINT "tickets_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"email_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_ticket" ON "activity" USING btree ("org_id","ticket_id");--> statement-breakpoint
CREATE INDEX "attachments_ticket" ON "attachments" USING btree ("org_id","ticket_id");--> statement-breakpoint
CREATE INDEX "audit_log_org_at" ON "audit_log" USING btree ("org_id","at");--> statement-breakpoint
CREATE INDEX "board_lists_product" ON "board_lists" USING btree ("org_id","product_id");--> statement-breakpoint
CREATE INDEX "comments_ticket" ON "comments" USING btree ("org_id","ticket_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invites_token_hash" ON "invites" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "members_org_user" ON "members" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX "members_user" ON "members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_person" ON "notifications" USING btree ("org_id","person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orgs_slug" ON "orgs" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "product_members_member" ON "product_members" USING btree ("org_id","member_id");--> statement-breakpoint
CREATE INDEX "sessions_user" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tickets_product" ON "tickets" USING btree ("org_id","product_id");--> statement-breakpoint
CREATE INDEX "tickets_assignee" ON "tickets" USING btree ("org_id","assignee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email" ON "users" USING btree ("email");