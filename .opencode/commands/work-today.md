---
description: Work on today's top kanban task
agent: build
---

Pick today's highest-priority open task and work it in its project directory.

Steps:
1. Call `kanban_list_today` (or `kanban_list_by_date` with today). Sort high > medium > low.
2. If no tasks: reply `idle — no tasks dated today` and stop. No writes.
3. If tie or ambiguous: list top 2-3 and ask which to work. Stay on current task.
4. Read `projectRoot` from the tool result. Stay in that directory only. Never open a second project without permission.
5. Mark running: `kanban_update_status {id, column: Doing, agentState: running}`. If `gitEnabled`, create `kanban/{id}-slug` branch locally, never on main.
6. Implement with small commits on that branch. Heartbeat via `kanban_add_note`.
7. When done: push branch (if gitEnabled), set `agentState: under-review`, reply summary. Never set `completed` — human merges and marks done.

$ARGUMENTS
