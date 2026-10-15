# 1Fold — v1 (task management)

Company sign-up, invites, and product boards for admins, managers and developers.
Next.js 16 (App Router) · React 19 · TypeScript · plain CSS with design tokens.

## Run it

```bash
npm install
npm run dev            # http://localhost:3000 → /signin
```

Explore without signing up: **Sign in → Explore the demo company → Admin / Manager / Developer**.

## Check it

```bash
npm run check          # type check + lint + unit tests (domain + data)
npm run build && npm run e2e   # Playwright journeys in Chrome against the production build
```

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
3. To release, open a pull request **`dev` → `stg`**. It needs CI and one approval. Merge commit only. Test everything on staging.
4. When staging is good, open a pull request **`stg` → `prod`**. Same rules.

Nobody pushes directly to `dev`, `stg` or `prod`, and they can't be force-pushed or deleted. The `branch-flow` check
rejects pull requests that skip a step (e.g. `feat/*` → `stg`, or `dev` → `prod`). `stg` and `prod` only take merge
commits, so promotions never rewrite history.

## Where things live

| Folder | What |
|---|---|
| `src/domain` | Types, permissions, and every change as a named pure command `(db, me, …args) → db`. No React, no storage. |
| `src/data` | The client store, sessions, password hashing (PBKDF2), and browser storage. |
| `src/features` | Screens by feature: `auth`, `products`, `tickets`, `people`, `home`, `mywork`, `shell`. |
| `src/ui` | Shared UI primitives. |
| `src/app` | Routes. `src/proxy.ts` keeps signed-out people on `/signin` and everyone inside their own panel. |

## Before the backend: what is browser-only today

- Each company's data lives in this browser (`src/data/storage.ts`). **Invite links only work in the browser that created them** until there is a server.
- The session cookie is set by the client. The backend should issue a signed, httpOnly session (`src/data/session.ts` marks the spot).
- No emails yet: admins copy invite links; password reset is done by an admin (People → Edit).
- The command names in `src/domain/commands/index.ts` are the contract the API and the MCP server should expose.
