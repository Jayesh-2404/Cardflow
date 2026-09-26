# My Board — Personal Kanban

Minimal, fast, single-user kanban with a per-task journal. Frontend: React + Vite +
Tailwind + dnd-kit. Backend: Express + Prisma + Neon (Postgres). Auth: email + password,
bcrypt, JWT in httpOnly cookies.

## Layout

```
projects/kanban-board/
  src/              # frontend (static, talks to API)
  server/           # API (Node + Prisma, holds all secrets)
  e2e/              # Playwright specs
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

First run: open the web app → **Create account** tab → register your email + password
(min 8). Registration locks after the first account (`403` afterwards). Then log in.

## Keyboard

The board is built to be driven without the mouse.

| Key            | Action                                        |
| -------------- | --------------------------------------------- |
| `Ctrl/Cmd + K` | Command palette (tasks, lists, actions)       |
| `?`            | Command palette                               |
| `N`            | New task                                      |
| `F`            | Filters panel                                 |
| `J`            | Journal panel                                 |
| `1`–`9`        | Jump to the nth list                          |
| `/`            | Focus the card filter                         |
| `Enter`        | Log a journal entry / add a card              |
| `Shift+Enter`  | New line inside a journal entry               |
| `Ctrl/Cmd+Enter` | Save the open task                          |
| `Esc`          | Close palette → editor → panel → clear search |

## What is included

**Board**

- Lists: Todo / Doing / Done default, add / rename (double-click) / delete (cards move to
  the first list), drag-drop within and across lists
- Cards: title, details, priority, due date, tags, list
- Due dates read as `Today`, `Tomorrow`, `4d late`, `Sep 26` rather than a raw ISO string
- Search and filters: priority, tag, overdue only, show archived
- Archive / restore / permanent delete, export/import JSON, reset demo, erase everything

**Journal**

Every mutation writes an append-only `TaskEvent`: created, moved, per-field updated,
archived/unarchived, deleted, plus free-form notes you write yourself.

- Per task: a timeline in the editor, oldest first, grouped by day, with an entry count on
  the card
- Across tasks: a Journal panel (rail icon or `J`) with an activity feed, All/Notes/Moves/
  Edits filters, and click-through to the card
- Entries deliberately have **no foreign key to `Task`** and keep a `taskTitle` snapshot,
  so archiving or deleting a card does not erase the record of what happened to it
- `updated` entries name only the fields that actually changed
- JSON export carries the journal, so a backup is a real backup

**Interface**

- Design tokens in `src/index.css`: tight radii, defined 1px borders, restrained shadows,
  one focus-visible outline, tabular numerals, `prefers-reduced-motion` guard
- 30 hand-drawn single-stroke SVG icons (`src/components/Icon.tsx`) — no emoji, so glyphs
  render identically on every platform
- Light and dark themes with `color-scheme` set per theme, so native widgets (select popup,
  date picker, scrollbars) match

## Auth design

- Passwords: bcrypt (12 rounds), never stored raw.
- Access token: JWT, 15 min, `kb_at` httpOnly cookie. Refresh token: JWT, 30 days,
  `kb_rt` httpOnly cookie, hash stored in DB, rotated on every use.
- Frontend auto-tries `POST /api/auth/refresh` once on 401, then retries.
- Cookies: `SameSite=Lax` (dev, same-site localhost) / `SameSite=None; Secure` (prod,
  cross-origin).
- Every board and journal query is scoped by `userId` from the verified token.
- Change password rotates everything (other sessions die, re-login required).

## Tests

E2E runs against a real API and a real Postgres journal, so persistence is genuinely
asserted. Registration locks after the first account, so the suite's user is provisioned
out of band.

```bash
# one-time: create the account the suite logs in as
cd server && npm run e2e:seed        # add --reset to wipe its board

# with the API and web dev servers running:
cd .. && npm run test:e2e            # desktop + mobile
npm run test:e2e:desktop            # desktop only
npm run typecheck:e2e                # typecheck specs and config
```

Override the account with `E2E_EMAIL` / `E2E_PASSWORD`, and the endpoints with
`E2E_WEB_URL` / `E2E_API_URL`.

## Env vars

Server (`server/.env`, gitignored — never commit):
`DATABASE_URL` (Neon pooled), `DIRECT_URL` (Neon direct, migrations only),
`JWT_SECRET` (32+ chars, `openssl rand -base64 32`), `FRONTEND_ORIGIN`, `PORT`.

Frontend build-time: `VITE_API_URL` (default `http://localhost:4000`).

## Deploy

- **Migrate first** — the journal lives in a new `TaskEvent` table:
  `npx prisma migrate deploy`
- API: any Node host (VPS, Render, Railway, Fly). Set env vars, `npm run build && npm start`.
- Web: static `dist/` anywhere (`vercel.json` included). Build with
  `VITE_API_URL=https://your-api-host`.
- Prod checklist: `NODE_ENV=production`, `FRONTEND_ORIGIN=https://your-board-url`, strong
  `JWT_SECRET`, Neon pooled URL at runtime.
