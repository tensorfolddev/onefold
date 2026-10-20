# Running 1Fold on a VPS

One server runs **production** (`1fold.tensorfold.ai`) and **staging** (`teamfold.tensorfold.ai`), completely apart:
each has its own database, files, settings, email account, WhatsApp number and Google Drive backups. Caddy sits in
front of both and handles HTTPS by itself.

```
VPS (Docker)
├── edge     caddy :80/:443 ── 1fold.tensorfold.ai → prod-web · teamfold.tensorfold.ai → stg-web
├── prod     postgres · web (website + API) · worker (scheduled jobs, WhatsApp)    volumes: db, files, whatsapp
└── stg      the same, smaller limits so it can never slow production down
```

Everything lives in `/opt/onefold`:

| Path | What |
|---|---|
| `repo/` | A clone of this repository (releases are fetched from it) |
| `prod/`, `stg/` | One environment: `.env` (database passwords, limits, backup settings), `app.env` (what the app reads), `release.env` (the image it runs), `deploy/` (the scripts of the release it runs), `backups/` (the newest 3) |
| `edge/` | Caddy: `Caddyfile`, `.env` (domains) |
| `rclone/rclone.conf` | Google Drive login + backup encryption password — **keep a copy in your password manager** |

All commands below are run on the server as the `onefold` user (`sudo -u onefold …`); they're in each environment's
`deploy/` folder, e.g. `/opt/onefold/prod/deploy/`. `stg` and `prod` are interchangeable everywhere.

## First-time setup

You need: a VPS with Ubuntu 22.04 or 24.04 (2 vCPU / 4 GB RAM / 40 GB disk is plenty to start), SSH access as root,
and the DNS for `tensorfold.ai`.

1. **On the server**, as root:
   ```bash
   git clone https://github.com/tensorfolddev/onefold.git && sudo bash onefold/deploy/setup.sh
   ```
   It installs Docker, a firewall (SSH/HTTP/HTTPS only), automatic security updates and a swap file; creates the
   `onefold` user; writes settings for both environments with random passwords; starts Caddy; and schedules backups.
   It asks for: the two domains, an email for certificates, each environment's Resend key and sender, the public
   SSH key CI deploys with (make one with `ssh-keygen -t ed25519 -f onefold-deploy -N ""`; paste `onefold-deploy.pub`)
   — it's pinned to `deploy/ssh-entry.sh`, so it can release a commit and nothing else — and, only if the image
   package stays private, a GitHub token with `read:packages`.
2. **DNS**: an `A` record for `1fold.tensorfold.ai` and for `teamfold.tensorfold.ai`, both to the server's IP.
3. **Email**: 1Fold's own Resend sends only sign-up confirmations and password resets (so nobody is ever locked out);
   every company sends its invites and briefs through its own Resend, set in **Integrations → Email**. In 1Fold's
   Resend account, verify the sending domain, then put the key in `/opt/onefold/<env>/app.env` (`RESEND_API_KEY=`,
   `EMAIL_FROM=`). Production sends from `tensorfold.ai`, staging from `teamfold.tensorfold.ai`.
4. **Backups**: see [Backups](#backups) below — about five minutes.
5. **GitHub** (Settings → Environments → New environment, `prod` and `stg`). On each:
   - **Deployment branches and tags** → *Selected branches* → only its own branch (`prod` / `stg`), and on `prod`
     **Required reviewers** → you. Then a workflow edited on any other branch can never reach the server's key.
   - variable `DEPLOY_HOST` = the server's IP; secrets `DEPLOY_SSH_KEY` = the private key (`onefold-deploy`) and
     `DEPLOY_KNOWN_HOSTS` = the output of `ssh-keyscan <server IP>`.

   Then a repository variable `DEPLOY_ENABLED` = `true`. After the first image is built, make it public (Packages →
   onefold → Package settings → Change visibility → Public) so the server can pull it without a token — the image
   holds no secrets.
6. **First release**: GitHub → Actions → deploy → Run workflow → `prod` (then `stg`). Or on the server:
   `/opt/onefold/repo/deploy/deploy.sh prod <commit>`. Open `https://1fold.tensorfold.ai/signup`.

## WhatsApp

There's no shared number: **every company connects its own** WhatsApp number — a dedicated SIM in a spare phone,
never a personal number. Until it does, that company has no WhatsApp (briefs go by its email, if it set one up). An
admin of the company connects it once (the session is kept in the `whatsapp` volume and backed up hourly):

1. Sign in, open **Integrations → Team Bot**, and press **Set up bot**. A QR code appears within a few seconds.
2. On the bot's phone: WhatsApp → **Settings → Linked devices → Link a device**, and scan it.

Teammates then link their own numbers from their name (top right) → **WhatsApp**: 1Fold gives them a code to send the
company's number, which proves the number is theirs. Each person has their own private chat with it. Briefs go out at
the time the company set (9:00 by default, in its time zone) on working days. If WhatsApp ever logs a company's number
out, its admins get an email (through the company's own email), briefs go by email meanwhile, and Team Bot shows it.
The worker's log: `compose.sh prod logs -f worker`.

## Each company's own Google Drive

Every company can connect **its own** Google Drive (Integrations → Google Drive): once a day the worker saves a
backup of only that company there — a `.zip` its admins can open, with all its data and files and no passwords or
secrets — and keeps the newest 30. This is on top of the hourly server backups above, which stay yours.

**Set it up once** (a Google login for 1Fold, about 10 minutes, free):

1. [console.cloud.google.com](https://console.cloud.google.com) → new project **1Fold**.
2. **APIs & Services → Library** → enable **Google Drive API**.
3. **Google Auth Platform → Branding**: app name 1Fold, your support email, authorised domain `tensorfold.ai`.
   **Audience**: External, then **Publish app**. **Data access**: add `…/auth/drive.file` (1Fold sees only the files
   it makes), `openid` and `email` — none of them needs Google's review.
4. **Clients → Create client → Web application**, with these authorised redirect URIs:
   `https://1fold.tensorfold.ai/api/drive/callback`, `https://teamfold.tensorfold.ai/api/drive/callback`
   (and `http://localhost:3000/api/drive/callback` for development).
5. Put its id and secret in each `/opt/onefold/<env>/app.env` (`GOOGLE_CLIENT_ID=`, `GOOGLE_CLIENT_SECRET=`), then
   `start.sh <env>`. The Google Drive card now offers **Connect Google Drive**.

**Restoring one company** (you only — its admins can see and download their backups, not restore them): they send
you the `.zip` from their Drive (Open in Drive → Download). Copy it to the server, then

```bash
restore-company.sh prod ~/acme-backup.zip   # shows what's in it, asks you to type the company's name
```

It backs up the whole environment first (so `restore.sh` can undo it), then replaces that company's data and files
with the backup's, in one go — no other company is touched, and its people stay signed in.

## Releasing

Releases go out by themselves: when the promote bot moves `stg` or `prod` (see the main README), the **deploy**
workflow builds that environment's image (`ghcr.io/tensorfolddev/onefold:<env>-<commit>`) and runs
`deploy.sh <env> <commit>` on the server, which:

1. takes that commit's `deploy/` folder as the environment's scripts,
2. makes a backup — the release's own restore point (`…-before-<commit>.tar`),
3. runs the new image's migrations while the old version keeps serving (migrations only ever add things),
4. restarts the website and worker on the new image and waits until they're healthy — **if they aren't, it puts the
   previous image back by itself** and the run fails, so you see it.

**Roll back** to any earlier release: Actions → deploy → Run workflow → *Use workflow from* that environment's own
branch (`prod` or `stg` — the GitHub environments only accept their own branch) → the environment + the older commit
(it must be on that branch's history); or on the server, `deploy.sh prod <older commit>`. Each run's output is kept in `/opt/onefold/<env>/deploy.log`
(and a failed release's last website logs in `deploy-failure.log`); a dropped CI connection doesn't stop a release. The database never needs to go back, because migrations stay compatible with the
version before them. If a release ever did damage data, restore its restore point (below).

## Day to day

| Do | Command |
|---|---|
| What's running | `status.sh` |
| Logs | `compose.sh prod logs -f --tail 100 web` (or `worker`, `postgres`) |
| Stop / start staging | `stop.sh stg` · `start.sh stg` (data stays; its domain shows 502 while stopped) |
| Change settings | edit `/opt/onefold/prod/app.env`, then `start.sh prod` |
| A database shell | `compose.sh prod exec postgres psql -U onefold_admin onefold` |
| Back up now | `backup.sh prod` |

## Backups

Every hour (production at :07, staging at :37) `backup.sh` saves the database, the uploaded files and the WhatsApp
session — plus the environment's settings — as one `.tar`, encrypted, to that environment's Google Drive. Drive keeps
the last **48 hourly** and **30 daily** backups; the server keeps the newest 3. Every release adds one more.

**Set it up once** (per environment, each with its own Google account if you like):

1. `sudo -u onefold /opt/onefold/repo/deploy/rclone.sh config` and create two remotes:
   - `n` → name `prod-drive` → storage `drive` → leave client id/secret empty → scope `1` (full) → leave the rest
     empty → **no** to "auto config" (it's a server). It prints a command to run on your laptop
     (`rclone authorize "drive" "…"` — install rclone there first); sign in with production's Google account there,
     paste the answer back.
   - `n` → name `onefold-prod` → storage `crypt` → remote `prod-drive:onefold-backups/prod` → filename encryption
     `standard` → let it generate a strong password (`g`) and a salt — rclone stores both in `rclone.conf`.

   Do the same for staging: `stg-drive`, then `onefold-stg` on `stg-drive:onefold-backups/stg`. The names
   `onefold-prod:` and `onefold-stg:` are what `BACKUP_REMOTE` in each `.env` points at.
2. **Save `/opt/onefold/rclone/rclone.conf` in your password manager.** Without it the backups can't be read — it
   holds the Drive login and the encryption password. (Google Drive only ever sees encrypted, renamed files.)
3. **Get told when a backup is missed**: at [healthchecks.io](https://healthchecks.io) (free), add one check per
   environment with period 1 hour, grace 30 minutes, and put its ping URL in `BACKUP_PING_URL=` in that
   environment's `.env`. Add a third (period 1 month) for `RESTORE_TEST_PING_URL=` in production's `.env`. Missed
   ping → email. A stopped environment doesn't back up — pause its check while it's stopped.
4. Try it: `backup.sh prod`, then `restore-test.sh prod`.

**Check backups really restore**: `restore-test.sh prod` restores the newest backup into a throwaway database, lets
the installed release upgrade and load every company from it, and prints what's in it. It runs by itself on the 1st
of every month; run it any time.

## Restoring

```bash
restore.sh prod latest                         # the newest backup (here or on Drive)
restore.sh prod onefold-prod-20261016T070700Z.tar   # a specific one (rclone.sh lsf onefold-prod:hourly lists them)
restore.sh prod /path/to/backup.tar            # a file you have
```

It asks you to type the environment's name, refuses a backup of the other environment (unless `ALLOW_OTHER_ENV=1`,
e.g. to copy production's data into staging), backs up the current state first (so the restore can be undone),
stops the website and worker, restores into a fresh database that replaces the old one only once it's complete,
puts back the files and WhatsApp session, applies any newer migrations, and starts everything again. Settings are
left alone.

## When the server dies

On a fresh Ubuntu VPS, as root:

```bash
git clone https://github.com/tensorfolddev/onefold.git && sudo bash onefold/deploy/recover.sh
```

It installs everything (as `setup.sh` does), asks you to paste `rclone.conf` from your password manager, then for
production and staging brings back the newest backup's settings, the release it was running, and its data. Then
point both DNS records at the new IP and update `DEPLOY_HOST` in GitHub. You lose at most the hour since the last
backup; expect 30–60 minutes in all.

## Moving to a bigger setup later

- **Bigger server**: `backup.sh prod` on the old one, then `recover.sh` on the new one — the same steps as above.
- **Production on its own server**: run `setup.sh` there and recover only production (`RECOVER_ENVS=prod recover.sh`),
  then point its DNS there.
- **Managed Postgres** (e.g. Neon): it's plain Postgres — restore a backup into it and point the app's database URL at
  it (a small change to `compose.yml`).

## Trying it on a laptop

The scripts also run on macOS with Docker Desktop. A scratch copy of everything:

```bash
export ONEFOLD_HOME=$PWD/.onefold-local
PROD_DOMAIN=prod.localhost STG_DOMAIN=stg.localhost bash deploy/setup.sh --configure-only
docker build --build-arg APP_ENV=stg -t onefold:local .
ONEFOLD_STAGE=2 DEPLOY_IMAGE=onefold:local $ONEFOLD_HOME/stg/deploy/deploy.sh stg 0000000
curl -k https://stg.localhost/api/health     # Caddy uses its own local certificates for *.localhost
```
