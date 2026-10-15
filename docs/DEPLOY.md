# Deploying My Board

Everything repo-side is committed; this runbook covers the account-side steps. A fresh
deploy is three pieces and takes about 30 minutes:

| Piece | What it is | Where it goes |
| --- | --- | --- |
| Database | Postgres (Neon) | neon.tech |
| API | Express + Prisma (`server/`) | any Node host — walkthrough uses Render |
| Web | static `dist/` (Vite) | any static host — walkthrough uses Vercel |

The existing services (`notes-jo06.onrender.com`, `notes-dusky-eta-79.vercel.app`) were
set up from the platform notes at the project root — `render.txt` and `vercel.txt`. Those
files remain the detailed war logs for those two dashboards; this document is the
end-to-end runbook. Read it top to bottom for a new deploy.

Commands below run from the repo root unless a `cd` says otherwise. Windows PowerShell
syntax is shown first; the bash equivalent is noted where it differs (`copy` vs `cp`).

## 0. Before you start

- Node 20+ locally and a checkout of this repo.
- Accounts on Neon, your API host and your static host.
- Two eventual URLs: the API (e.g. `https://your-api.onrender.com`) and the web app
  (e.g. `https://your-board.vercel.app`). You will set them as env vars later; write
  them down now.

## 1. Neon: create the database

1. neon.tech → **New Project** (name: `kanban`; pick the region closest to your API host).
2. Dashboard → **Connection Details**. Copy **both** strings and keep `?sslmode=require`:

   | Neon copy | Goes into | Used for |
   | --- | --- | --- |
   | **Pooled** (host contains `-pooler`) | `DATABASE_URL` | every runtime query |
   | **Direct** (no `-pooler`) | `DIRECT_URL` | `prisma migrate deploy` only |

   A pooled connection cannot run the DDL that migrations need, so `DIRECT_URL` is not
   optional.

## 2. Migrate first

The API's journal reads a table that must exist before the first boot; land migrations
before (or with) the first production boot.

```powershell
cd projects/kanban-board/server
npm ci --include=dev
copy .env.example .env      # bash: cp .env.example .env
# edit .env: DATABASE_URL = pooled, DIRECT_URL = direct, JWT_SECRET = a fresh secret
npm run preflight:dev       # exit 0 once those values are sane (production-only rules relaxed)
npx prisma migrate deploy
npx prisma migrate status   # expect: "Database schema is up to date!"
```

`prisma migrate deploy` is the production command (never `migrate dev` against prod).
It applies only new migrations, so it is safe to re-run. Generate the JWT secret now and
keep it for step 3: `openssl rand -base64 32` (or without openssl:
`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`).

If you cannot run commands locally (no checkout on the machine), the API host's start
command below chains `db:deploy` on every boot, which covers this step on Render. Other
hosts: run it as a release/pre-deploy command there.

## 3. API host

### Render walkthrough (matches render.txt)

Service → **Settings → Build & Deploy**:

| Setting | Value |
| --- | --- |
| Root Directory | `server` |
| Build Command | `npm ci --include=dev && npm run build` |
| Start Command | `npm run db:deploy && npm start` |
| Health Check Path | `/api/health` |

Why `--include=dev`: the service sets `NODE_ENV=production`, npm then silently skips
devDependencies, and every `@types/*` package is a devDependency — the build dies with
a wall of `TS7016` errors that looks like a TypeScript problem. `--include=dev` forces
them back in. (`render.txt` §1 has the full story.)

Why `server` and not the project root: the root `package.json` is the Vite frontend.
Pointing Render at it runs `vite`, which never binds a port Render can see.

### Environment variables

| Var | Value |
| --- | --- |
| `DATABASE_URL` | Neon pooled URL |
| `DIRECT_URL` | Neon direct URL |
| `JWT_SECRET` | 32+ random chars, generate fresh — `openssl rand -base64 32`, or without openssl: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `FRONTEND_ORIGIN` | the exact deployed web URL: scheme + host, https, **no trailing slash** (e.g. `https://your-board.vercel.app`) |
| `NODE_ENV` | `production` |
| `PORT` | leave unset — Render injects it |

Three of these are load-bearing beyond "add a var":

- `NODE_ENV=production` switches the auth cookies to `SameSite=None; Secure`. Without it
  the cookies are `Lax` and a cross-origin web app can never stay logged in.
- `FRONTEND_ORIGIN` is the exact CORS allow-origin **and** the cookie scope. If it is
  wrong, the API still answers curl with `{"ok":true}` but the browser refuses the
  response — the UI shows "API unreachable" against a perfectly healthy API. The server
  refuses to boot in production without it, so that failure appears in the boot log
  instead of the browser console.
- `JWT_SECRET` shorter than 32 chars, missing, or still placeholder text is rejected at
  boot.

Before saving, check exactly these values with the production rules (paste your real
values; the script reads `server/.env`, but real environment variables win):

```powershell
cd projects/kanban-board/server
$env:NODE_ENV='production'
$env:DATABASE_URL='postgresql://...pooler...:5432/kanban?sslmode=require'
$env:DIRECT_URL='postgresql://...direct...:5432/kanban?sslmode=require'
$env:JWT_SECRET='...'
$env:FRONTEND_ORIGIN='https://your-board.vercel.app'
npm run preflight     # exit 0 = safe to save; one FAIL line per problem otherwise
```

Save, then **restart the service** (Render: Manual Deploy → Restart; env changes need a
restart even though the build succeeded).

### Any other Node host

Build `npm ci --include=dev && npm run build`, start `npm run db:deploy && npm start`,
set the same five vars (`PORT` may be injected there too). The server binds all
interfaces by default; the host only needs to map its `PORT`.

## 4. Web host

### Vercel walkthrough (matches vercel.txt)

| Setting | Value |
| --- | --- |
| Root Directory | `projects/kanban-board` |
| Framework Preset | Vite (leave; `vercel.json` pins build command, output dir and the SPA rewrite) |

Environment variable (**Production** scope):

```
VITE_API_URL=https://your-api.onrender.com
```

`VITE_API_URL` is inlined into the JS bundle **at build time** — changing it in the
dashboard does nothing until you redeploy. To catch the classic mistake early, a
production Vercel build with no `VITE_API_URL` now fails with a message saying exactly
this; preview and local builds only warn, so a preview without the var does not go red.

Verify the deployed bundle carries the URL:

```
curl -s https://your-board.vercel.app/ | grep -o '/assets/[^"]*\.js'
curl -s https://your-board.vercel.app/assets/<that-file>.js | grep -o 'https://[a-z0-9.-]*onrender\.com'
```

### Any other static host

```powershell
cd projects/kanban-board
$env:VITE_API_URL='https://your-api.onrender.com'
npm ci
npm run build      # upload dist/
```

The `rewrites` in `vercel.json` only apply to Vercel; other hosts need their own
SPA fallback to `index.html` if they serve deep links (the app is a single view, so
serving `index.html` for unknown paths is enough).

## 5. Verify end-to-end

API reachable and healthy (Windows: use `curl.exe`, not the PowerShell `curl` alias):

```powershell
curl.exe -i https://your-api.onrender.com/api/health
# expect: HTTP 200 and {"ok":true}

curl.exe -i https://your-api.onrender.com/api/health/db
# expect: HTTP 200 and {"ok":true,"db":"up"} — retry once on a cold Neon wake-up

curl.exe -i -H "Origin: https://your-board.vercel.app" https://your-api.onrender.com/api/health
# expect: access-control-allow-origin: https://your-board.vercel.app
#         access-control-allow-credentials: true
```

Then, in the browser, the checklist:

- [ ] **Register / login** — new account on the deployed URL; reload keeps you signed in
      (proves Secure, cross-site cookies).
- [ ] **Board CRUD** — create a card in each list, edit it, drag it across lists, archive
      and restore; all survive a reload.
- [ ] **SSE live update** — open the board in two tabs side by side, move a card in one;
      the other updates within a second, and the header live dot is green.
- [ ] **Journal** — open a card, log a note; the entry appears on the card timeline and
      in the journal panel (`J`), and still reads after a reload.
- [ ] **MCP token** — drive the board from an agent once. Preferred local setup: put
      `KANBAN_USER_ID` in `server/.env`. Find your id in the Neon SQL editor:

      ```sql
      SELECT id, email FROM "User" ORDER BY "createdAt";
      ```

      then restart OpenCode and call `list_today`: it should return the deployed board.
      The `KANBAN_TOKEN` variant needs a **fresh access JWT** (kb_at cookie from a
      logged-in browser, or minted with the production `JWT_SECRET`) because tokens
      live 15 minutes; it only verifies when the local `server/.env` carries the same
      `JWT_SECRET` that signed it (see README §MCP).

## 6. Rollback notes

- **Web**: Vercel → Deployments → pick the previous good one → **Promote to Production**
  (instant, no database impact).
- **API**: Render → Events / deploys → **Rollback** to the previous deploy. Env var
  values are *not* rolled back — re-check the dashboard if the incident was a config
  change. Same idea on any other host: redeploy the previous commit.
- **Database**: migrations in this repo are additive, so an older API commit runs fine
  against the current schema. `prisma migrate deploy` cannot undo a migration; if data
  itself must go back, create a Neon branch from a point in time (project → Branches →
  Restore), verify against it, and only then repoint `DATABASE_URL`. Test on the branch,
  not on the primary.
- **Emergency session reset**: rotating `JWT_SECRET` invalidates every session at once
  (everyone re-logs in). Rotating the Neon password invalidates the URLs — update the
  host env and restart.
- **Data safety**: the web app has export/import JSON (Sidebar); the journal prunes from
  the UI (`J` → Delete older) if the table ever needs trimming.

## 7. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| UI: "API unreachable", but `curl /api/health` is 200 | `FRONTEND_ORIGIN` mismatched (scheme, host, trailing slash) or `VITE_API_URL` stale | Fix the var, restart/redeploy; check the ACAO header test in §5 |
| Build log: `TS7016 ... Could not find a declaration file` | devDependencies skipped under `NODE_ENV=production` | Build command must be `npm ci --include=dev && npm run build` |
| `prisma migrate deploy` hangs or fails on Neon | `DIRECT_URL` points at the pooler | Use the direct (non-pooler) connection string |
| Server exits at boot with "Server configuration is invalid" | one of the checks above (JWT strength, `FRONTEND_ORIGIN`, `NODE_ENV`, port) | The message lists exactly what to set; reproduce locally with `npm run preflight` and the same values |
| Signed in, then bounced to login on the deployed site | API host missing `NODE_ENV=production` (cookies stay `Lax`) | Set it, restart the API |
| First request after ~15 min idle takes 30–50 s | free-tier instance/DB asleep | Not a bug; retry, or move to a paid instance (render.txt §5) |
| Login returns 429 | auth rate limit (60 tries / 10 min / IP) | Wait 10 minutes |
| Live updates stop after the stream drops (network blip, laptop sleep) | web bundle built before the reconnect fix; the reconnects ride an expired access cookie | Deploy the current web build — the stream now refreshes the session and reconnects itself |
| MCP: "Invalid KANBAN_TOKEN" | token expired (15 min) or signed with a different `JWT_SECRET` | Prefer `KANBAN_USER_ID`, or mint a token with the production secret |

## 8. What the repo checks for you

- On the API host, the server refuses to boot when the production config is missing or
  weak (same rules as the CLI check below), instead of serving broken cookies/CORS.
- `npm run preflight` (server/) — production rules; run it with the values the host will
  get. Exit code 1 on errors, clear hint per line. `npm run preflight:dev` relaxes the
  production-only rules for local work.
- `npm ci` in `server/` generates the Prisma client (`postinstall`), so `npm run
  typecheck` works on a fresh clone without a manual `prisma generate`.
- `/api/health/db` answers 503 when the database is unreachable, so the gap between
  "process up" and "actually usable" is one curl away.
