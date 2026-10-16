# 1Fold — v1 (task management)

Company sign-up, invites, and product boards for admins, managers and developers.
Next.js 16 (App Router) · React 19 · TypeScript · PostgreSQL 17 (Drizzle) · plain CSS with design tokens.
Design: [docs/specs/2026-10-15-backend-v1-design.md](docs/specs/2026-10-15-backend-v1-design.md).

## Run it

Needs Node 22 and Docker.

```bash
npm install
cp .env.example .env.local     # then fill in: dev passwords match deploy/compose.dev.yml; SESSION_SECRET = openssl rand -base64 36
npm run db:up                  # local Postgres in Docker (127.0.0.1:5433)
npm run db:migrate             # create / update the tables
npm run dev                    # http://localhost:3000 → create a company at /signup
```

`npm run db:down` stops the database (your data stays in its Docker volume).

## Check it

```bash
npm run check                  # type check + lint + every test (unit and real-database; needs `npm run db:up`)
npm run build && npm run e2e   # Playwright journeys in Chrome against the production build and the database
```

Changing the database: edit `src/server/db/schema.ts`, run `npm run db:generate`, commit the new file in `drizzle/`.
Migrations only ever **add** things (design §12): never edit a released migration, never drop what the running
version uses.

## Email

Invites, "confirm your email" and password-reset links go out through [Resend](https://resend.com): set
`RESEND_API_KEY` and `EMAIL_FROM` (a sender on a domain verified in that Resend account). Without a key nothing is sent
and development prints each email to the server log; `EMAIL_OUTBOX_DIR` writes them to a folder instead (the tests use
it). Once email is set up, a new founder confirms their email before their invites go out.

## Files

Ticket images are uploaded to `POST /api/files` (PNG, JPEG, WebP or GIF — checked by their bytes, at most 10 MB) and
kept on disk in `FILES_DIR` (default `./data/files`, git-ignored; a backed-up volume in Docker). `GET /api/files/<id>`
serves one only to people who can see its ticket. Images nothing refers to any more — not a ticket, not anyone's
Undo — are deleted by `cleanupFiles()` once they're an hour old.

## Deploying

One VPS runs production (`1fold.tensorfold.ai`) and staging (`teamfold.tensorfold.ai`) side by side, each with its own
database, files and settings, behind Caddy (HTTPS). Releases deploy themselves when the promote bot moves `stg` or
`prod`; backups go to Google Drive every hour, encrypted; one command restores, and one command rebuilds everything on
a new server. Setup and every command: [deploy/README.md](deploy/README.md).

The worker (`npm run worker` locally) runs scheduled jobs next to the website.

## WhatsApp brief

The worker runs a WhatsApp bot (Baileys, the way Hermes Agent does: bot mode on its own number, deny by default,
never writes first). People link their number by sending it a one-time code (their name → WhatsApp); every working
day at 9:00 in the company's time zone they get all their pending tickets, project by project, with due dates and
links. Replying 1FOLD sends it again anytime; it can't be switched off. When WhatsApp is down the brief goes by email. Platform admins (`PLATFORM_ADMIN_EMAILS`) pair the
bot in Settings → WhatsApp. Locally: `npm run worker` next to `npm run dev`.

## Claude & MCP

`/api/mcp` is an MCP server (Streamable HTTP, the official TypeScript SDK). Each person makes a personal API token
(their name → Claude & MCP — shown once, stored hashed, revocable) and connects Claude Code with the command shown:

```bash
claude mcp add --transport http onefold https://1fold.tensorfold.ai/api/mcp --header "Authorization: Bearer 1fold_…"
```

Tools: `list_products`, `list_tickets`, `get_ticket`, `create_ticket`, `update_ticket`, `move_ticket`, `add_comment`,
`set_section`, `add_dependency`. They run as the token's owner — same permissions, same commands, audit log source
`mcp`, live in everyone's browser. Tool names and required inputs never change (design §12.8): only new tools and
optional inputs are added.

## Environments

`NEXT_PUBLIC_APP_ENV` = `dev` | `stg` | `prod` (see `.env.example`). dev and stg show a badge on every screen.

## Branches and releases

```
feat/<name> ─┐
fix/<name>  ─┴─► dev ──► stg ──► prod
                 (all work)  (staging server  (production server
                              + its own DB)    + its own DB)
```

1. Start from `dev`: `git switch dev && git pull && git switch -c feat/clock` (or `fix/clock`).
2. Open a pull request **into `dev`**. CI must pass (`checks`, `e2e`, `branch-flow`). Squash-merge.
3. To release, open a pull request **`dev` → `stg`**. Wait for CI, get one approval (an admin may skip it), then add
   the label **`promote`**. The promote bot moves `stg` to exactly that commit and GitHub marks the PR merged.
   Test everything on staging.
4. When staging is good, open a pull request **`stg` → `prod`** and do the same.

Nobody pushes directly to `dev`, `stg` or `prod`, and they can't be force-pushed or deleted. The `branch-flow` check
rejects pull requests that skip a step (e.g. `feat/*` → `stg`, or `dev` → `prod`). `stg` and `prod` have no merge
button: releases are fast-forwards done by the promote bot (`.github/workflows/promote.yml`), so `stg` and `prod` are
always a commit on `dev`'s history — never ahead of it. The bot's deploy key lives in the `promote` environment,
which only `stg` and `prod` can use.

## Where things live

| Folder | What |
|---|---|
| `src/domain` | Types, permissions, and every change as a named pure command `(db, me, …args) → db`. No React, no storage. |
| `src/data` | The browser side: the store (talks to the API), recorded commands, cookies' shared rules. |
| `src/server` | The server: database schema + migrations, loading/saving a company, accounts, changes, live updates. |
| `src/app/api` | The API routes the browser calls. |
| `src/features` | Screens by feature: `auth`, `products`, `tickets`, `people`, `home`, `mywork`, `shell`. |
| `src/ui` | Shared UI primitives. |
| `src/app` | Routes. `src/proxy.ts` keeps signed-out people on `/signin` and everyone inside their own panel. |

## How a change reaches the database

A screen calls a command (`createTicket`, `moveTicket`…) from `src/data/commands`. The store shows the result at once,
and sends the recorded steps to `POST /api/org/changes`. The server replays them on the real data as that person
(same rules, same permission checks), in one transaction, saves only the rows that changed, writes the audit log and
tells everyone else's browser to refresh. Each browser only ever receives what its person may see.

Everything in the design's v1 build order is built; see "Not in v1" there for what comes later.
