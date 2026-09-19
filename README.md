# My Board — Personal Kanban

Minimal, fast, single-user kanban. Frontend: React + Vite + Tailwind + dnd-kit (static).
Backend: Express + Prisma + Neon (Postgres). Auth: email + password, bcrypt, JWT in httpOnly cookies.

## Layout

```
projects/kanban-board/
  src/              # frontend (static, talks to API)
  server/           # API (Node + Prisma, holds all secrets)
```

## Run locally

```bash
# 1. API
cd projects/kanban-board/server
npm install
cp .env.example .env   # fill DATABASE_URL, DIRECT_URL, JWT_SECRET
npx prisma migrate dev # creates tables in Neon
npm run dev            # http://localhost:4000

# 2. Web (new terminal)
cd projects/kanban-board
npm install
npm run dev            # http://localhost:5173
```

First run: open the web app → **Create account** tab → register your email + password (min 8).
Registration locks after the first account (`403` afterwards). Then log in.

## What is included

- Lists: Todo / Doing / Done default, add / rename (double-click) / delete (tasks move to first list)
- Cards: title, details, priority, due date, tags, column — drag-drop within/across columns
- Search (`/` or `Ctrl+K`), filters: priority, tag, overdue only, show archived
- Archive / restore / permanent delete, export/import JSON, reset demo, erase everything
- Slim icon rail sidebar + overlay panel (Filters / Archive / Settings)
- Light default theme + dark toggle (local preference), Inter + JetBrains Mono
- Shortcuts: `N` new task, `Ctrl+Enter` save, `Esc` close

## Auth design (Option A)

- Passwords: bcrypt (12 rounds), never stored raw.
- Access token: JWT, 15 min, `kb_at` httpOnly cookie. Refresh token: JWT, 30 days,
  `kb_rt` httpOnly cookie, hash stored in DB, rotated on every use.
- Frontend auto-tries `POST /api/auth/refresh` once on 401, then retries.
- Cookies: `SameSite=Lax` (dev, same-site localhost) / `SameSite=None; Secure` (prod, cross-origin).
- Every board query is scoped by `userId` from the verified token.
- Change password rotates everything (other sessions die, re-login required).

## Env vars

Server (`server/.env`, gitignored — never commit):
`DATABASE_URL` (Neon pooled), `DIRECT_URL` (Neon direct, migrations only),
`JWT_SECRET` (32+ chars, `openssl rand -base64 32`), `FRONTEND_ORIGIN`, `PORT`.

Frontend build-time: `VITE_API_URL` (default `http://localhost:4000`).

## Deploy

- API: any Node host (VPS, Render, Railway, Fly). Set env vars, run `npx prisma migrate deploy`, `npm run build && npm start`.
- Web: static `dist/` anywhere. Build with `VITE_API_URL=https://your-api-host`.
- Prod checklist: `NODE_ENV=production`, `FRONTEND_ORIGIN=https://your-board-url`, strong `JWT_SECRET`, Neon pooled URL at runtime.
