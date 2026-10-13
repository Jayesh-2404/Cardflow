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
(min 8). Every account gets a private board. Boards stay isolated by `userId`.

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

- Design tokens in `src/index.css`: 6/8/12px radii, defined 1px borders, restrained shadows,
  one focus-visible outline, tabular numerals, `prefers-reduced-motion` guard
- 30 hand-drawn single-stroke SVG icons (`src/components/Icon.tsx`) — no emoji, so glyphs
  render identically on every platform
- Light and dark themes with `color-scheme` set per theme, so native widgets (select popup,
  date picker, scrollbars) match

## Realtime

`GET /api/board/stream` is an SSE feed scoped to the signed-in user. Every board
or journal mutation bumps a per-user version and pushes one event. Tabs listen
with `EventSource` and refetch board plus journal on push. Heartbeat every 25s.
Single process hub. Fine for a small team. Redis pubsub is the swap when a
second API replica appears.

## Journal retention (DB growth)

`TaskEvent` is append-only by design, so the board adds a delete path rather than
letting it grow forever:

- Per entry: hover any timeline row or journal feed row → trash icon
  (`DELETE /api/board/journal/:id`).
- Per task: open a card → Journal header → `Clear` removes that card's history
  (`DELETE /api/board/journal?taskId=...`).
- Bulk prune: Journal panel → pick a date → `Delete older` removes everything
  strictly before that day (`DELETE /api/board/journal?before=yyyy-mm-dd`).
- Tasks are never touched by these endpoints — only journal rows.

Opinion: keep auto-created `created/moved/updated` entries (they are small and make
the timeline truthful), prune `note`-heavy or old history per task/date when the
table gets large. Indexes on `(userId, createdAt)` and `(taskId, createdAt)` keep
both the feed and per-task timeline fast.

## MCP (applied AI)

`server/src/mcp.ts` is a stdio MCP server so an agent (OpenCode) can work the
board directly. Wired in `opencode.jsonc` (`kanban` server, runs from the board
root, auth from `server/.env` via `KANBAN_USER_ID` or `KANBAN_TOKEN`).

Tools: `list_today`, `list_by_date`, `get_task`, `update_status`, `add_note`,
`delete_note`, `prune_journal`. Writes go through the same journal + validators
(`validBranch`/`validCommit`) as the REST API, so agent moves show up in the
timeline. Project paths resolve via `server/project-roots.json`
(copy from `project-roots.example.json`, gitignored).

Rules the agent is held to (all in `server/src/mcp-filters.ts`, unit-tested):

- **An agent never marks a card Done.** `update_status` only accepts `Todo`/`Doing`.
  `Done` is absent from the tool schema on purpose — if the model tries it anyway the
  error tells it to use `agentState: "under-review"` and let a human close the card.
  The REST API is unrestricted, so you can still close cards yourself.
- **`list_today` and `list_by_date` skip Done cards**, so finished work does not read
  as open. `list_by_date` takes `includeDone: true` to see them anyway.
- **"Today" is local, not UTC.** Resolved via `Intl` in `KANBAN_TZ` (default
  `Asia/Kolkata`), because between 00:00 and 05:30 IST the UTC date is yesterday and
  deploys run in UTC anyway.

`opencode.jsonc` wires the server up and holds the agent's `permission` block
(`permission`, singular, keyed by tool name — and `bash`, not `shell`). Note the global
config at `~/.config/opencode/opencode.jsonc` currently overrides the `kanban` command
there to run the **compiled** `server/dist/mcp.js`, so source changes need
`cd server && npx tsc` (a plain `npm run build` fails while the MCP is running — Prisma's
engine DLL is locked).

## Diagrams

- `docs/kanban-architecture.excalidraw` (+ `.png`) — full REST app: web, API, DB.
- `docs/kanban-mcp.excalidraw` (+ `.png`) — MCP agent path: 7 tools, same journal.
- Regenerate: `python docs/gen_diagrams.py`. Both files open directly in excalidraw.com (Menu → Open).

## Auth design

- Passwords: bcrypt (12 rounds), never stored raw.
- Access token: JWT, 15 min, `kb_at` httpOnly cookie. Refresh token: JWT, 30 days,
  `kb_rt` httpOnly cookie, hash stored in DB, rotated on every use.
- **Sessions are per device.** Each login writes a `Session` row, so several
  browsers stay signed in at once and signing out of one leaves the others alone.
  (This was a single `refreshTokenHash` column on `User`, which allowed exactly
  one live session — a second login silently logged the first browser out.)
- Frontend auto-tries `POST /api/auth/refresh` once on 401, then retries — **including
  for `/api/auth/me`**, which is the session bootstrap call. Only `login`,
  `register`, `password` and `refresh` itself are exempt, since their 401s are real
  answers rather than an expired token. Concurrent 401s share one refresh so they
  cannot race the rotation.
- Cookies: `SameSite=Lax` (dev, same-site localhost) / `SameSite=None; Secure` (prod,
  cross-origin).
- Every board and journal query is scoped by `userId` from the verified token.
- Change password revokes every session (all browsers re-login required).

## Tests

Server rules are pure functions, so they unit-test without a database:

```bash
cd server
npm test                # node:test via tsx — MCP list/move rules
npm run typecheck       # src + the test suite
```

E2E runs against a real API and a real Postgres journal, so persistence is genuinely
asserted. The suite logs in as a provisioned account and resets its own board.

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
`JWT_SECRET` (32+ chars, `openssl rand -base64 32`), `FRONTEND_ORIGIN`, `PORT`,
plus MCP-only `KANBAN_USER_ID`/`KANBAN_TOKEN` and `KANBAN_TZ` (default
`Asia/Kolkata`).

Frontend build-time: `VITE_API_URL` (default `http://localhost:4000`).

## Deploy

- **Migrate first** — the journal lives in a new `TaskEvent` table:
  `npx prisma migrate deploy`
- API: any Node host (VPS, Render, Railway, Fly). Set env vars, `npm run build && npm start`.
- Web: static `dist/` anywhere (`vercel.json` included). Build with
  `VITE_API_URL=https://your-api-host`.
- Prod checklist: `NODE_ENV=production`, `FRONTEND_ORIGIN=https://your-board-url`, strong
  `JWT_SECRET`, Neon pooled URL at runtime.
