# 1Fold v1 backend — design

Status: draft for approval · 2026-10-15 · Owner: Tensorfold

## 1. Goal

Turn today's browser-only 1Fold into a real, multi-user product: accounts and companies live on a server, teammates
see each other's changes, invites and password resets arrive by email, every teammate gets a **daily WhatsApp brief**,
and Claude (or any MCP client) can create and update tickets through an **MCP server**.

It runs on **one VPS** with fully separate **production** (`1fold.tensorfold.ai`) and **staging**
(`teamfold.tensorfold.ai`), using only free software and free tiers (the VPS and two SIMs are the only costs).

The foundation must carry the later modules (HR, finance, documentation) without a rebuild — see §14. Releases never lose data (§12), and growth is a configuration change (§13).

## 2. Decisions

| Area | Decision |
|---|---|
| Language | **TypeScript** everywhere. The existing domain commands and their 55 tests are reused on the server unchanged. |
| Shape | **One Next.js app** serves the website *and* the API. One **worker** process runs the WhatsApp bot and scheduled jobs. |
| Database | **PostgreSQL 17** in Docker on the VPS — one instance per environment. **Drizzle** for schema + migrations. |
| Files | On the VPS disk (a Docker volume). Backed up with the database. |
| Backups | **Hourly**, encrypted, to **Google Drive** (rclone). Keep 48 hourly + 30 daily. Missed backup → email. Daily VPS snapshots on top. |
| Email | **Resend** (free tier). Separate account per environment. |
| WhatsApp | **Baileys bridge, Hermes-style bot mode** (§8). Dedicated SIM per environment. Email fallback. |
| HTTPS | **Caddy** — automatic certificates for both subdomains. |
| Deploy | Docker Compose. CI builds images; a release to `stg`/`prod` deploys automatically. One-command setup and recovery. |
| Time zone | `Asia/Karachi` default, per company. |

## 3. Architecture

```
VPS (Docker)
├── caddy            :80/:443 → 1fold.tensorfold.ai → prod-web · teamfold.tensorfold.ai → stg-web
├── production       web (Next.js: pages + /api) · worker (WhatsApp + jobs) · postgres · backup
└── staging          web · worker · postgres · backup          (own volumes, secrets, Resend, SIM, Drive folder)
```

Code layout (same repo):

| Folder | Holds |
|---|---|
| `src/domain` | Unchanged pure commands, types, permissions, templates — the single source of business rules. New: `snapshotFor(db, me)`. |
| `src/server` | Database schema + migrations, loading/saving a company, auth, email, files, WhatsApp, MCP, audit. Server-only. |
| `src/app/api/**` | HTTP endpoints (Next.js route handlers). |
| `src/worker` | The worker's entry point: WhatsApp bridge + scheduler. |
| `deploy/` | `compose.yml`, `Caddyfile`, scripts (`setup`, `deploy`, `start`/`stop`, `backup`, `restore`, `restore-test`, `recover`). |

## 4. How a change works (the command seam)

Every change is already a named pure command `(db, me, …args) → db`. The server runs the same commands:

1. The browser calls `POST /api/commands/<name>` with the arguments (exactly what `run(name, args)` sends today).
2. The server opens a transaction and takes a **per-company lock** (`pg_advisory_xact_lock`), so two writes to one
   company never interleave and no update is lost.
3. It loads that company's data, runs the command **as the signed-in member** (permission checks inside the command
   are now authoritative), and writes **only the rows that changed** (a generic diff by id per collection).
4. It records the command in the **audit log** (who, what, when, from where: web / MCP / WhatsApp), bumps the
   company's `version`, and commits.
5. Postgres `NOTIFY` tells every open browser of that company; they refresh their copy.

The browser keeps today's instant feel: it applies the command locally first, then reconciles with the server
(refusal → undo + toast; someone else changed something → refetch).

*Ceiling:* a write loads the whole company — fine for thousands of tickets. When a company outgrows that, commands
declare which collections they need and only those load; nothing else changes.

**Reads.** `GET /api/org` returns `snapshotFor(db, me)`: only what this person may see — no password hashes ever,
developers get only their products' tickets/docs, invites only for admins, only their own notifications. It is a pure
domain function with its own tests.

## 5. Data model

All tables carry `org_id`; **row-level security** policies (`org_id = current_setting('app.org_id')`) make
cross-company reads impossible even if a query forgets a filter. The app connects as a non-owner role.

| Group | Tables |
|---|---|
| Accounts | `users` (email, password_hash, email_verified_at) · `members` (org, user, panel, job title, team, capacity, colour, active) · `sessions` · `email_tokens` (reset-password and confirm-email links) · `api_tokens` · `invites` |
| Company | `orgs` (slug, name, email_domain, domain_lock, timezone, version) · `teams` · `job_titles` · `product_groups` |
| Products | `products` · `product_members` · `board_lists` · `requirements` · `decisions` · `milestones` · `docs` · `stage_requests` |
| Tickets | `tickets` (PK org + key "AP-12"; `sections` JSONB) · `ticket_dependencies` · `attachments` (metadata; bytes on disk) · `comments` · `ticket_activity` · `notifications` |
| Platform | `audit_log` · `whatsapp_bot` (the bot's state, QR while pairing, admin requests) · `whatsapp_links` (a member's chat, brief on/off) · `whatsapp_link_codes` · `brief_deliveries` (one per person per day) |

Rules: secrets only hashed (passwords Argon2id; session / reset / invite / API tokens SHA-256); timestamps
`timestamptz`, due dates `date`; nothing computed is stored; people are deactivated, never deleted.

A person is one `user` (login) with one `member` row per company — sign-in's "which company?" already handles this.

## 6. Accounts and security

- **Sign-up / sign-in / sign-out / forgot / reset / verify email / accept invite** as API endpoints behind the
  existing pages. Passwords: Argon2id. Sign-up sends a verification email; invites can't be sent until it's verified.
- **Sessions:** random token in an `httpOnly`, `Secure`, `SameSite=Lax` cookie; only its hash is stored; 30-day sliding
  expiry; revoked on sign-out, password change or deactivation. `proxy.ts` keeps its routing role.
- **CSRF:** `SameSite=Lax` plus an `Origin` check on every non-GET request.
- **Rate limits:** sign-in, sign-up, forgot, invite-accept, MCP (per IP and per email/token). In-memory — one web
  process per environment (*ceiling:* move to Postgres if we ever run several).
- **Headers:** CSP with per-request nonce, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, frame-ancestors none.
- **Errors:** users see plain messages; details go to the server log, never to the browser.

## 7. Email (Resend)

Invites (with the copyable link kept as a backup), password reset, email verification, the daily brief's email
fallback, and admin alerts (WhatsApp disconnected). Production sends from `tensorfold.ai`, staging from
`teamfold.tensorfold.ai`, each with its own Resend account and API key.

## 8. WhatsApp daily brief (Hermes-style)

Follows how Hermes Agent runs WhatsApp: a **Baileys** bridge (Node.js, no browser), **bot mode** on a **dedicated
number**, **deny by default**, and **never message someone who hasn't messaged the bot first**.

- **Pairing the bot (a platform admin — `PLATFORM_ADMIN_EMAILS` — once):** Settings → WhatsApp shows a QR (refreshes ~every 20 s). Scan it from the bot
  phone: *Linked Devices → Link a device*. The session is saved on the worker's disk (`chmod 700`, in the encrypted
  backups, never in git), so restarts don't need a rescan.
- **A teammate joins:** Profile → *Connect WhatsApp* shows a one-tap `wa.me` link with a code prefilled
  (`1FOLD-7K2QXM`: once, for 15 minutes). They send it; the bot matches the code, links their number, and replies "You're connected".
  This proves the number is theirs **and** means they messaged first. Unknown senders are ignored.
- **The brief:** at **9:00 Pakistan time** on working days, each connected member gets all their pending tickets,
  project by project, soonest due first, with links. Messages go out a few seconds apart. Replying `1FOLD` sends it
  now; there's no `stop` — the brief is part of the job, not a subscription.
- **When WhatsApp fails** (logged out, banned, protocol change): the brief goes by **email** instead, the admin gets
  an email and sees *Disconnected — scan again* in Settings. We keep the Baileys dependency up to date.
- **Risk, stated plainly:** Baileys is unofficial; WhatsApp can restrict the bot number. Dedicated SIM, opt-in only,
  one message a day and the email fallback keep the risk and the impact small.

## 9. MCP server

`/api/mcp` (MCP Streamable HTTP, official TypeScript SDK). Each person creates a **personal API token** in their
profile (shown once, stored hashed, revocable) and gives it to Claude Code. Tools map to commands and reads:
`list_products`, `list_tickets` (filters), `get_ticket` (with template sections), `create_ticket`, `update_ticket`,
`move_ticket`, `add_comment`, `set_section`, `add_dependency`. They run as the token's owner, with the same
permissions and audit log as the website. Tokens live in `api_tokens` (SHA-256 only, last 4 characters to tell them
apart, revocable); people make them from their name → Claude & MCP, which also shows the `claude mcp add` command.
Stateless: each request authenticates on its own; 120 requests a minute per token.

## 10. Files

Uploads go to `POST /api/files` (images only for v1, checked by content not extension, size-limited) and are stored
at `/data/files/<org>/<id>` on a volume. Downloads go through `GET /api/files/<id>`, which checks the viewer may see
that ticket. Backed up hourly with the database.

## 11. Environments, deployment, backups, recovery

- **Separate everything:** database, volumes, `.env`, Resend account, WhatsApp SIM, Drive folder. CPU/memory limits
  on staging so it can never slow production. `./stop.sh stg` / `./start.sh stg` at any time.
- **Releases deploy themselves:** when the promote bot moves `stg` or `prod`, CI builds the Docker image, pushes it
  to GitHub's registry, and SSHes to the VPS to run `./deploy.sh <env> <commit>`: pull, run migrations, restart.
  Migrations are written to work with the previous version too, so a deploy never breaks the running site.
- **Backups:** every hour (host cron) `pg_dump` + the files and WhatsApp volumes + the environment's settings → one
  `.tar` → encrypted (rclone crypt, rclone itself in Docker) → that environment's Google Drive; 48 hourly + 30 daily
  kept; each run pings healthchecks.io, which emails if a backup is missed. `./restore.sh <env> <backup>` restores
  (into a fresh database, swapped in only when complete); `./restore-test.sh <env>` restores the latest into a
  throwaway database, lets the installed release migrate and load it, and reports (monthly).
- **Server dies:** `./recover.sh` on a fresh VPS installs Docker, firewall and the stack, then restores the latest
  backup from Drive — back online in ~30–60 min, losing at most the last hour. Tested before we call it done.
- **Easy setup for anyone later:** `./setup.sh` on a clean Ubuntu VPS asks for the settings and does the rest;
  `deploy/README.md` explains every command.
- **Local development:** `docker compose -f deploy/compose.dev.yml up` gives a local Postgres; `npm run dev` as today.
  The demo company is seeded in development and staging only — production has no demo.

## 12. Releases never lose data (backward compatibility)

From the first production release on, moving to a new version never loses or damages data, and any release can be
rolled back in minutes.

1. **Additive changes only, in steps ("expand → switch → clean up").** A release may add tables, columns and indexes.
   It never drops or renames something the running version uses. A rename is three releases apart: add the new
   column and copy the data → switch the code to it → only then, after it has run fine in production, remove the old
   one. So the *previous* app version always works on the *new* database.
2. **A backup before every release.** `deploy.sh` takes a fresh encrypted backup *before* running migrations, so each
   release has its own restore point on top of the hourly ones.
3. **Migrations are permanent history.** Each is a numbered file in git, applied once, inside a transaction (all or
   nothing), and never edited after release. A failed migration leaves the database exactly as it was.
4. **CI proves the upgrade.** An `upgrade-test` job builds the database the way the *current production release*
   left it (its migrations + demo data), applies the new release's migrations, and checks that no rows were lost and
   the end-to-end tests pass. A release that would lose data can't be promoted.
5. **Destructive changes are opt-in.** CI rejects a migration that drops or renames anything unless the PR carries the
   `destructive-migration` label and the old code stopped using it in an earlier release.
6. **Rollback in one command.** Every release is a Docker image tagged with its commit. `./deploy.sh prod <previous>`
   brings the old version back in about a minute; because of rule 1 the database doesn't need to go back. Worst case,
   the pre-release backup (rule 2) is there.
7. **Old screens keep working.** A browser still open on the old version talks to the new server: commands only ever
   gain *optional* arguments, and the page shows "A new version is available — refresh" when the server is newer.
8. **Claude and other MCP clients keep working.** MCP tools and their required inputs are never renamed or removed —
   only new tools and optional inputs are added; an old tool is marked deprecated for at least one release first.
9. **Stored JSON carries a version.** Template sections and other JSON fields record their format version, and the
   code reads every older format (as `normalize()` does in the browser today).

The browser-only version used so far holds test data only, so v1 starts with a clean database. From then on, these
rules apply to every release.

## 13. How it scales

Each step below is a configuration change, not a rewrite:

| When | Do |
|---|---|
| Start | One VPS: both environments, as in §3. |
| The VPS gets busy | A bigger VPS, or production on its own VPS (`recover.sh` moves it: backup → new server → restore). |
| The database gets busy | Postgres on its own server, or a managed one (e.g. Neon) — change `DATABASE_URL`; it's plain Postgres. |
| Many users at once | Run several web copies behind Caddy. Sessions and data are already in Postgres and live updates go through Postgres `NOTIFY`, so copies need nothing shared; only the rate limiter moves into Postgres. |
| Big companies | Commands load only the collections they need (§4) instead of the whole company. |
| Lots of files | Swap the disk folder for S3-compatible storage behind the same files interface. |
| New modules (HR, finance) | New folders and tables on the same core (§14). |

Indexes on `org_id` and every foreign key from day one keep queries fast as data grows.

## 14. Foundation for HR, finance and docs

- **Modules:** new areas get their own folders and tables (`hr_*`, `finance_*`) and talk to the core (companies,
  members, permissions, audit) — never to each other's tables.
- **Permissions:** every check already goes through one `can()` function. v1 keeps the three panels; role and
  permission tables arrive with the first module that needs finer rules (HR) — a change inside `can()`, not the screens.
- **Audit log:** every change already lands in `audit_log` with who and when.
- **Money (when finance starts):** integer minor units + currency, never floats; posted entries are never edited.
- **Sensitive HR fields (when HR starts):** encrypted per field, keys outside the database.

## 15. Testing

- Domain unit tests (existing 55) + new: `snapshotFor`, the diff writer.
- Server integration tests against a **real Postgres** (Docker locally, a service container in CI): every endpoint,
  permissions, company isolation (RLS), rate limits, sessions.
- Playwright end-to-end against the full Docker stack: today's 6 journeys now cross two browsers (an admin invites,
  the invitee joins elsewhere, both see the same board).
- **Upgrade test** (§12): every release is migrated from the current production state in CI; no lost rows, e2e green.
- WhatsApp: the bridge sits behind a small interface; tests use a fake. One manual check on staging with the real SIM.

## 16. Build order

Each step is its own `feat/*` branch → `dev` → `stg` → `prod`.

1. **Server foundation + accounts** — local Postgres, schema + migrations, company load/save,
   `POST /api/org/changes`, `GET /api/org`, live refresh, sign-up / sign-in / sessions / invites by link, undo;
   the browser store switches from local storage to the API. (Accounts moved here: the app can't use server data
   without knowing who is signed in.)
2. **Email** — invite emails, email verification, password reset by email, brief fallback (Resend).
3. **Files** — uploads and downloads on disk.
4. **Deployment** — Docker images, Caddy, compose for both environments, CI deploy, pre-release backup, upgrade test,
   one-command rollback, hourly backups, restore, recovery.
5. **WhatsApp brief** — worker, pairing, connect flow, schedule, email fallback.
6. **MCP server** — tokens and tools.

## 17. Not in v1

HR, finance, document bodies (docs stay title + type), live co-editing, roles beyond admin/manager/developer,
a mobile app, the official WhatsApp Cloud API.
