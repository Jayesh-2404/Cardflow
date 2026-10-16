# Cardflow

Kanban board with a per-card journal, live sync across tabs, and an MCP server that lets AI agents work the board.

![Cardflow system overview](docs/system-overview.png)

Cardflow is a small kanban app. The unusual part is the journal. Every change to a card is appended to it, so each card carries its own history. The same journal records what an AI agent does when it works the board through the built-in MCP server.

## What it does

- **Board.** Three lists to start with (Todo, Doing, Done). Drag cards within and across lists. Cards have a title, details, priority, due date, and tags. Due dates render as "Today", "4d late", or "Sep 26". Archive, restore, export, and import are included.
- **Journal.** Every mutation writes a TaskEvent: created, moved, field changes, archived, deleted, plus free-form notes. Open a card for its timeline, or press J for the feed across all cards.
- **Live sync.** The API pushes one server-sent event per change, and open tabs refetch the board. Two tabs stay in step within a second.
- **Keyboard control.** Ctrl/Cmd+K opens a command palette. N creates a task, J opens the journal, and / focuses the card filter. The full table is below.
- **Agents.** server/src/mcp.ts is a stdio MCP server with 7 tools (list_today, list_by_date, get_task, update_status, add_note, delete_note, prune_journal). An OpenCode session uses it to pick up today's cards, move them, and journal notes. Agent writes pass the same validators and land in the same journal as the web UI. Agents cannot mark a card Done. A human does that.

## Run it locally

You need Node 20 or newer and a Postgres database. Neon's free tier works.

1. Set up the API.

   ```
   cd server
   npm install
   cp .env.example .env    # then fill DATABASE_URL, DIRECT_URL, JWT_SECRET
   npx prisma migrate dev
   npm run dev             # http://localhost:4000
   ```

2. Start the web app from the repo root in a second terminal.

   ```
   npm install
   npm run dev             # http://localhost:5173
   ```

3. Open http://localhost:5173 and create an account. Each account gets a private board. Registration and login are rate limited.

## How it works

- The web app is a React SPA (Vite and Tailwind). It talks JSON over REST and holds auth in httpOnly cookies.
- The API is Express with Prisma and Postgres. The tables are User, Session, Column, Task, and TaskEvent.
- Every board mutation writes its journal row in the same request. A journal failure never fails the change itself.
- GET /api/board/stream pushes one event per mutation. Connected tabs refetch the board on each event.
- The MCP server runs over stdio, not HTTP. It writes through the same code paths as the REST routes.
- In production the API refuses to boot with a broken config. `npm run preflight` in `server/` checks the same rules before a deploy.

The data model, auth design, and agent rules are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). The deploy runbook is [docs/DEPLOY.md](docs/DEPLOY.md).

## Keyboard

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
| `Esc`          | Close the palette, editor, or panel, then clear the search |

## Tests

Server rules are pure functions, so they test without a database.

```
cd server
npm test          # unit tests via node:test and tsx
npm run typecheck
```

The e2e suite drives Playwright against a real API and a real Postgres.

```
cd server && npm run e2e:seed    # one-time: creates the account the suite uses
cd .. && npm run test:e2e        # with both dev servers running
```

## Project layout

```
src/       web app (React, Vite, Tailwind)
server/    API and MCP server (Express, Prisma)
e2e/       Playwright specs (desktop and mobile)
docs/      architecture notes, deploy runbook, diagrams
```
