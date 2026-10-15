-- Security: foreign keys, row-level security (one company can never see another's rows), and the app's role.
-- Runs as the database owner. The website and worker connect through a login role that is a member of onefold_app
-- (created by src/server/db/migrate.ts): it can read and write rows, but can't change the schema, can't bypass
-- row-level security, and can't edit or delete the audit log.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'onefold_app') THEN
    CREATE ROLE onefold_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO onefold_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO onefold_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO onefold_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO onefold_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO onefold_app;
REVOKE UPDATE, DELETE ON audit_log FROM onefold_app;
--> statement-breakpoint

-- ---------- foreign keys: checked when each change commits, so a command may write rows in any order ----------
ALTER TABLE orgs ADD CONSTRAINT orgs_founder_fk FOREIGN KEY (id, created_by) REFERENCES members (org_id, id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE sessions ADD CONSTRAINT sessions_member_fk FOREIGN KEY (org_id, user_id) REFERENCES members (org_id, user_id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_org_fk FOREIGN KEY (org_id) REFERENCES orgs (id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE members ADD CONSTRAINT members_org_fk FOREIGN KEY (org_id) REFERENCES orgs (id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE invites ADD CONSTRAINT invites_by_fk FOREIGN KEY (org_id, invited_by) REFERENCES members (org_id, id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE teams ADD CONSTRAINT teams_org_fk FOREIGN KEY (org_id) REFERENCES orgs (id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE teams ADD CONSTRAINT teams_lead_fk FOREIGN KEY (org_id, lead_id) REFERENCES members (org_id, id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE job_titles ADD CONSTRAINT job_titles_org_fk FOREIGN KEY (org_id) REFERENCES orgs (id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE product_groups ADD CONSTRAINT product_groups_org_fk FOREIGN KEY (org_id) REFERENCES orgs (id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE products ADD CONSTRAINT products_org_fk FOREIGN KEY (org_id) REFERENCES orgs (id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE products ADD CONSTRAINT products_pm_fk FOREIGN KEY (org_id, pm_id) REFERENCES members (org_id, id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE products ADD CONSTRAINT products_project_manager_fk FOREIGN KEY (org_id, project_manager_id) REFERENCES members (org_id, id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE products ADD CONSTRAINT products_group_fk FOREIGN KEY (org_id, group_id) REFERENCES product_groups (org_id, id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE product_members ADD CONSTRAINT product_members_product_fk FOREIGN KEY (org_id, product_id) REFERENCES products (org_id, id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE product_members ADD CONSTRAINT product_members_member_fk FOREIGN KEY (org_id, member_id) REFERENCES members (org_id, id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE board_lists ADD CONSTRAINT board_lists_product_fk FOREIGN KEY (org_id, product_id) REFERENCES products (org_id, id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE requirements ADD CONSTRAINT requirements_product_fk FOREIGN KEY (org_id, product_id) REFERENCES products (org_id, id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE decisions ADD CONSTRAINT decisions_product_fk FOREIGN KEY (org_id, product_id) REFERENCES products (org_id, id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE decisions ADD CONSTRAINT decisions_by_fk FOREIGN KEY (org_id, by_id) REFERENCES members (org_id, id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE milestones ADD CONSTRAINT milestones_product_fk FOREIGN KEY (org_id, product_id) REFERENCES products (org_id, id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE docs ADD CONSTRAINT docs_product_fk FOREIGN KEY (org_id, product_id) REFERENCES products (org_id, id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE docs ADD CONSTRAINT docs_author_fk FOREIGN KEY (org_id, author_id) REFERENCES members (org_id, id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE stage_requests ADD CONSTRAINT stage_requests_product_fk FOREIGN KEY (org_id, product_id) REFERENCES products (org_id, id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE stage_requests ADD CONSTRAINT stage_requests_by_fk FOREIGN KEY (org_id, requested_by) REFERENCES members (org_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE tickets ADD CONSTRAINT tickets_product_fk FOREIGN KEY (org_id, product_id) REFERENCES products (org_id, id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE tickets ADD CONSTRAINT tickets_status_fk FOREIGN KEY (org_id, status_id) REFERENCES board_lists (org_id, id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE tickets ADD CONSTRAINT tickets_assignee_fk FOREIGN KEY (org_id, assignee_id) REFERENCES members (org_id, id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE tickets ADD CONSTRAINT tickets_requirement_fk FOREIGN KEY (org_id, requirement_id) REFERENCES requirements (org_id, id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE tickets ADD CONSTRAINT tickets_epic_fk FOREIGN KEY (org_id, epic_id) REFERENCES tickets (org_id, id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE tickets ADD CONSTRAINT tickets_created_by_fk FOREIGN KEY (org_id, created_by) REFERENCES members (org_id, id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE ticket_dependencies ADD CONSTRAINT ticket_dependencies_ticket_fk FOREIGN KEY (org_id, ticket_id) REFERENCES tickets (org_id, id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE ticket_dependencies ADD CONSTRAINT ticket_dependencies_on_fk FOREIGN KEY (org_id, depends_on_id) REFERENCES tickets (org_id, id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE attachments ADD CONSTRAINT attachments_ticket_fk FOREIGN KEY (org_id, ticket_id) REFERENCES tickets (org_id, id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE attachments ADD CONSTRAINT attachments_by_fk FOREIGN KEY (org_id, added_by) REFERENCES members (org_id, id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE comments ADD CONSTRAINT comments_ticket_fk FOREIGN KEY (org_id, ticket_id) REFERENCES tickets (org_id, id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE comments ADD CONSTRAINT comments_author_fk FOREIGN KEY (org_id, author_id) REFERENCES members (org_id, id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE activity ADD CONSTRAINT activity_ticket_fk FOREIGN KEY (org_id, ticket_id) REFERENCES tickets (org_id, id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE activity ADD CONSTRAINT activity_actor_fk FOREIGN KEY (org_id, actor_id) REFERENCES members (org_id, id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE notifications ADD CONSTRAINT notifications_person_fk FOREIGN KEY (org_id, person_id) REFERENCES members (org_id, id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE notifications ADD CONSTRAINT notifications_actor_fk FOREIGN KEY (org_id, actor_id) REFERENCES members (org_id, id) DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint

-- ---------- row-level security: a transaction only sees the company in app.org_id ----------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['invites', 'teams', 'job_titles', 'product_groups', 'products', 'product_members', 'board_lists',
    'requirements', 'decisions', 'milestones', 'docs', 'stage_requests', 'tickets', 'ticket_dependencies', 'attachments',
    'comments', 'activity', 'notifications', 'audit_log'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY company_rows ON %I USING (org_id = current_setting(''app.org_id'', true)) '
      'WITH CHECK (org_id = current_setting(''app.org_id'', true))', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- People: your company's members, plus your own memberships elsewhere (sign-in's "which company?").
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
CREATE POLICY company_rows ON members
  USING (org_id = current_setting('app.org_id', true) OR user_id = current_setting('app.user_id', true))
  WITH CHECK (org_id = current_setting('app.org_id', true));
--> statement-breakpoint

-- Companies: the current one, plus the ones you belong to.
ALTER TABLE orgs ENABLE ROW LEVEL SECURITY;
CREATE POLICY company_rows ON orgs
  USING (id = current_setting('app.org_id', true)
    OR id IN (SELECT org_id FROM members WHERE user_id = current_setting('app.user_id', true)))
  WITH CHECK (id = current_setting('app.org_id', true));
--> statement-breakpoint

-- An invite link opens its own invite (looked up by the hash of its token) before you belong to the company.
DROP POLICY company_rows ON invites;
CREATE POLICY company_rows ON invites
  USING (org_id = current_setting('app.org_id', true) OR token_hash = current_setting('app.invite_token_hash', true))
  WITH CHECK (org_id = current_setting('app.org_id', true));
--> statement-breakpoint

-- Sign-up asks "is this short name free?" without seeing any company.
CREATE FUNCTION onefold_slug_taken(s text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT EXISTS (SELECT 1 FROM orgs WHERE slug = s) $$;
REVOKE ALL ON FUNCTION onefold_slug_taken(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onefold_slug_taken(text) TO onefold_app;
