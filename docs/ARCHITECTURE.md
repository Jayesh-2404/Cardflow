# Architecture

How Cardflow's pieces fit together. For local setup, see the README. For deploys, see DEPLOY.md.

## System shape

![System overview](system-overview.png)

- The browser runs the web app (React, Vite, Tailwind) as a static build.
- The API (Express, Prisma) serves the REST routes, the SSE stream, and all auth.
- Postgres stores User, Session, Column, Task, and TaskEvent.
- The MCP server (server/src/mcp.ts) is a separate stdio process. It reads and writes the same tables through the same helpers as the API.
- An AI agent session (OpenCode) talks to the MCP server over stdio JSON-RPC.

Both the web app and the agent go through code that scopes every query by userId and writes a journal row for every mutation.

## Data model

Defined in server/prisma/schema.prisma.

- **User.** id, email (unique), passwordHash, createdAt.
- **Session.** One row per signed-in device: userId, tokenHash (unique), createdAt, expiresAt. Sessions used to be a single column on User, which logged the first browser out whenever a second one signed in. Now they coexist, and refresh rotation touches only the row in use.
- **Column.** userId, title, position. Indexed on (userId, position).
- **Task.** userId, columnId, title, description, priority, dueDate, tags[], archived, position, plus the agent fields: projectKey, agentState, gitEnabled, branch, lastCommit.
- **TaskEvent.** The journal. userId, taskId, taskTitle, type, summary, detail?, fromColumn?, toColumn?, createdAt.

### Why TaskEvent has no foreign key to Task

A journal that loses its history when a card is deleted is useless. Entries keep a taskTitle snapshot and survive the task row, so archive and delete stay visible in the feed. Indexes on (userId, createdAt) and (taskId, createdAt) keep the feed and the per-card timeline fast.

### Event types

created, updated, moved, archived, unarchived, note, deleted, agent-started, agent-review, agent-completed, git-commit.

`updated` entries name only the fields that actually changed.

## Journal behavior

- The API writes the journal row in the same request as the mutation. The write is best effort. A journal failure is logged, and the mutation still succeeds.
- Retention: DELETE /api/board/journal/:id removes one entry. DELETE /api/board/journal with a taskId or before filter clears one card's history or prunes old entries. Tasks are never touched by these endpoints.

## Auth

- Access token: JWT, 15 minutes, in the kb_at httpOnly cookie. Refresh token: JWT, 30 days, in kb_rt. The database stores only a hash of the refresh token, and every use rotates it.
- Cookies are SameSite=Lax in development and SameSite=None; Secure in production.
- The frontend retries a request once on 401 after refreshing the session. That includes the /api/auth/me bootstrap call. Only login, register, password, and refresh itself skip the retry, because their 401s are real answers.
- Changing the password revokes every session.
- Every board and journal query is scoped by the userId from the verified token.

## Realtime

- Each mutation bumps a per-user version counter and pushes one event on GET /api/board/stream. The stream sends a ping periodically to keep proxies from closing it, and sets X-Accel-Buffering: no so nginx-style proxies do not buffer the events.
- Clients listen with EventSource. On a stream error the client refreshes its session first and then reconnects, so an idle tab with an expired access cookie recovers on its own.
- The SSE hub lives in one process. A second API replica needs a shared pub/sub channel such as Redis.

## Agent path (MCP)

- server/src/mcp.ts speaks stdio only. The HTTP server never mounts it. opencode.jsonc wires it as the local `kanban` MCP server.
- Auth resolves per tool call from KANBAN_USER_ID (local single user) or KANBAN_TOKEN (access JWT signed with the same JWT_SECRET, so it lives 15 minutes).
- Tools: list_today, list_by_date, get_task, update_status, add_note, delete_note, prune_journal.
- list_today and list_by_date skip cards in a Done list. list_by_date takes includeDone: true to see them anyway.
- update_status accepts Todo and Doing only. Done is absent from the tool schema on purpose. If a model tries it, the error tells it to set agentState to under-review and leave the card for a human.
- "Today" resolves in the KANBAN_TZ timezone (default Asia/Kolkata), because between 00:00 and 05:30 IST the UTC date is still yesterday.
- Project keys map to local paths through server/project-roots.json (gitignored).
- Writes go through the same validators and journal helpers as the REST API, so agent moves appear in the same timeline as yours.

## Web app

- No state store. App state is useState plus optimistic updates on drag, and the board refetches after every live event.
- Design tokens live in src/index.css: radii, borders, focus ring, tabular numerals, dark mode.
- Icons are hand-drawn single-stroke SVGs in src/components/Icon.tsx. No emoji, so glyphs render the same on every platform.

## Environment variables

Server (server/.env, gitignored):

| Variable | Purpose |
| --- | --- |
| DATABASE_URL | Postgres URL for runtime queries (the Neon pooled URL in production) |
| DIRECT_URL | Postgres URL for migrations (the Neon direct URL) |
| JWT_SECRET | Signs session tokens. 32 characters minimum |
| FRONTEND_ORIGIN | Exact origin of the web app. CORS and cookies depend on it |
| PORT | HTTP port, default 4000 |
| NODE_ENV | production switches cookies to Secure and enables the strict config checks |
| KANBAN_USER_ID or KANBAN_TOKEN | MCP authentication |
| KANBAN_TZ | Timezone for "today" in the MCP tools, default Asia/Kolkata |

Frontend, build time only:

| Variable | Purpose |
| --- | --- |
| VITE_API_URL | Base URL of the API, inlined into the bundle at build time |

## Diagrams

- docs/system-overview.excalidraw is the picture above. Open it on excalidraw.com to edit it.
- docs/kanban-architecture.excalidraw (and .png) is the detailed REST-path diagram: every route, table, and rule.
- docs/kanban-mcp.excalidraw (and .png) is the detailed agent-path diagram.
- Regenerate the two detailed diagrams with `python docs/gen_diagrams.py`.

## Known limits

- The auth rate limit allows 30 registration attempts and 60 login attempts per 10 minutes per IP.
- Free-tier hosts sleep after idle, so the first request can take 30 to 50 seconds.
- The SSE hub is single-process, as noted above.
