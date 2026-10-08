"""Generate precise Excalidraw scenes for the kanban-board project.

Outputs (importable in excalidraw.com via Menu > Open):
  docs/kanban-architecture.excalidraw   - full REST app architecture
  docs/kanban-mcp.excalidraw            - MCP agent path
"""
import json
import os
import random
import string

random.seed(42)

HERE = os.path.dirname(os.path.abspath(__file__))

INK = "#1e1e1e"
BLUE = "#dbeafe"
GREEN = "#dcfce7"
YELLOW = "#fef9c3"
RED = "#ffe4e6"
PURPLE = "#f3e8ff"
GRAY = "#f1f5f9"
ORANGE = "#ffedd5"
TRANSPARENT = "transparent"


def _id(n=8):
    return "".join(random.choice(string.ascii_letters + string.digits) for _ in range(n))


def rect(el, x, y, w, h, fill=TRANSPARENT, sw=2, dash=None):
    d = {
        "id": _id(), "type": "rectangle", "x": x, "y": y, "width": w, "height": h,
        "angle": 0, "strokeColor": INK, "backgroundColor": fill, "fillStyle": "solid" if fill != TRANSPARENT else "solid",
        "strokeWidth": sw, "strokeStyle": "solid", "roughness": 1, "opacity": 100,
        "groupIds": [], "roundness": {"type": 3}, "seed": random.randint(0, 2**31),
        "version": 1, "versionNonce": random.randint(0, 2**31), "isDeleted": False,
        "boundElements": [], "updated": 1, "link": None, "locked": False,
    }
    if dash == "dashed":
        d["strokeStyle"] = "dashed"
    el.append(d)
    return d["id"]


def text(el, x, y, w, h, s, size=16, mono=False, align="center"):
    d = {
        "id": _id(), "type": "text", "x": x, "y": y, "width": w, "height": h,
        "angle": 0, "strokeColor": INK, "backgroundColor": TRANSPARENT, "fillStyle": "solid",
        "strokeWidth": 1, "strokeStyle": "solid", "roughness": 1, "opacity": 100,
        "groupIds": [], "roundness": None, "seed": random.randint(0, 2**31),
        "version": 1, "versionNonce": random.randint(0, 2**31), "isDeleted": False,
        "boundElements": [], "updated": 1, "link": None, "locked": False,
        "fontSize": size, "fontFamily": 3 if mono else 1, "text": s, "originalText": s,
        "textAlign": align, "verticalAlign": "middle", "lineHeight": 1.25, "baseline": h,
        "autoResize": False,
    }
    el.append(d)
    return d["id"]


def box(el, x, y, w, h, title, body="", fill=TRANSPARENT, title_size=19, body_size=15, mono_body=False):
    rect(el, x, y, w, h, fill)
    s = title + ("\n" + body if body else "")
    # rough height: title + body lines
    text(el, x + 10, y + 8, w - 20, h - 16, s, size=title_size if not body else body_size)
    # overlay title emphasis via second element is overkill; single element is fine


def arrow(el, x1, y1, x2, y2, label="", label_size=14):
    pts = [[0, 0], [x2 - x1, y2 - y1]]
    w = abs(x2 - x1) or 1
    h = abs(y2 - y1) or 1
    d = {
        "id": _id(), "type": "arrow", "x": x1, "y": y1, "width": w, "height": h,
        "angle": 0, "strokeColor": INK, "backgroundColor": TRANSPARENT, "fillStyle": "solid",
        "strokeWidth": 2, "strokeStyle": "solid", "roughness": 1, "opacity": 100,
        "groupIds": [], "roundness": {"type": 2}, "seed": random.randint(0, 2**31),
        "version": 1, "versionNonce": random.randint(0, 2**31), "isDeleted": False,
        "boundElements": [], "updated": 1, "link": None, "locked": False,
        "points": pts, "lastCommittedPoint": None,
        "startBinding": None, "endBinding": None,
        "startArrowhead": None, "endArrowhead": "arrow",
        "elbowed": False,
    }
    el.append(d)
    if label:
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        lw = max(200, len(label.split("\n")[0]) * 8)
        text(el, mx - lw / 2, my - 34, lw, 28, label, size=label_size, mono=True)


def scene(elements):
    return {"type": "excalidraw", "version": 2, "source": "kanban-board docs script",
            "elements": elements,
            "appState": {"viewBackgroundColor": "#ffffff", "gridSize": None},
            "files": {}}


# ---------------------------------------------------------------- architecture
def build_architecture():
    el = []
    text(el, 40, 20, 1900, 60,
         "Kanban Board — App Architecture (REST path, MCP excluded)", size=34)
    text(el, 40, 75, 1900, 30,
         "React + Vite + Tailwind  |  Express + Prisma + Neon Postgres  |  JWT cookies  |  append-only TaskEvent journal",
         size=17)

    # ---- containers
    rect(el, 30, 120, 620, 1050, GRAY)                       # web
    text(el, 40, 128, 600, 34, "WEB  —  React 19 + Vite + Tailwind v4  (:5173)", size=20)
    rect(el, 670, 120, 660, 1050, BLUE)                      # api
    text(el, 680, 128, 640, 34, "API  —  Express 4 + Prisma 6  (:4000)", size=20)
    rect(el, 1350, 120, 560, 1050, GREEN)                    # db
    text(el, 1360, 128, 540, 34, "DB  —  Neon Postgres (Prisma)", size=20)

    # ---- web interior
    box(el, 50, 175, 580, 90, "App.tsx — shell + state (useState only, no store)",
        "DndContext (dnd-kit) · commit() optimistic → server board\nmatchesFilters() · journalQueue chain · Ctrl+K / N / J / F / ? / 1-9", fill="#ffffff")
    box(el, 50, 275, 285, 105, "lib/api.ts",
        "fetch + credentials:include\n401 → POST /auth/refresh once → retry\nfromServer() normalises board", fill="#ffffff", mono_body=True)
    box(el, 345, 275, 285, 105, "lib/format.ts",
        "dueMeta · relTime · dayLabel\ntodayISO() (local-tz overdue)", fill="#ffffff", mono_body=True)
    box(el, 50, 390, 285, 120, "Header + Sidebar",
        "search ( / ) · done/total · Commands\nrail: filters / journal / archive / settings", fill="#ffffff")
    box(el, 345, 390, 285, 120, "BoardColumn + TaskCard",
        "SortableContext horiz + vertical\ncolumn-grip · col-body drop · quick-add", fill="#ffffff")
    box(el, 50, 520, 285, 140, "TaskEditor + Timeline",
        "EditorDraft · Ctrl+Enter save\nNoteComposer (Enter=log)\nper-row delete · Clear history", fill="#ffffff")
    box(el, 345, 520, 285, 140, "JournalPanel + Palette",
        "feed All/Notes/Moves/Edits · prune date\nCtrl+K fuzzy (tasks cap 8, lists, actions)", fill="#ffffff")
    box(el, 50, 670, 580, 100, "Login.tsx",
        "login / register tabs · ≥8 chars · 403 after first user · bcrypt note", fill="#ffffff")
    box(el, 50, 780, 580, 120, "Design tokens — src/index.css + Icon.tsx",
        "radii 6/8/12 · 1px borders · 1 focus ring · tabular nums\n33 hand-drawn SVG icons · NO emoji · light/dark color-scheme", fill="#ffffff")
    box(el, 50, 910, 580, 120, "Build — vite",
        "VITE_API_URL → API base (default :4000)\nnpm run build → static dist/ (vercel.json)", fill=YELLOW, mono_body=True)
    box(el, 50, 1040, 580, 100, "E2E — Playwright (desktop + mobile)",
        "real API + real Postgres journal\nseed via server/scripts/seed-e2e.ts", fill=YELLOW)

    # ---- api interior
    box(el, 690, 175, 620, 80, "src/index.ts",
        "trust proxy · cors(FRONTEND_ORIGIN) · cookieParser · json 1mb · /api/health", fill="#ffffff", mono_body=True)
    box(el, 690, 265, 620, 130, "routes/auth.ts — /api/auth",
        "POST register (first-user lock) · login · refresh (rotate hash)\nPOST logout · GET me · POST password (kills sessions)", fill="#ffffff", mono_body=True)
    box(el, 690, 405, 620, 165, "routes/board.ts — reads",
        "GET / → {board} · GET /tasks?due=&project=&limit=\nGET /journal?limit= → {counts, events} · GET /tasks/:id/timeline", fill="#ffffff", mono_body=True)
    box(el, 690, 580, 620, 200, "routes/board.ts — writes (all journalled)",
        "POST/PATCH/DELETE columns (+/order) · POST/PATCH tasks\nPOST /tasks/:id/move · DELETE /tasks/:id · POST /replace\nPOST /reset · DELETE / (wipe) · DELETE /journal, /journal/:id", fill=YELLOW, mono_body=True)
    box(el, 690, 790, 305, 125, "middleware + tokens",
        "requireAuth: verify kb_at (15m)\nkb_rt 30d · SHA256 stored · rotate", fill="#ffffff", mono_body=True)
    box(el, 1005, 790, 305, 125, "journal.ts + validate.ts",
        "record() best-effort · 11 EVENT_TYPES\nparseDueDate · cleanTags · validBranch/Commit", fill="#ffffff", mono_body=True)
    box(el, 690, 925, 620, 115, "board.ts + db.ts",
        "getBoardState() · seedDefaults(Todo/Doing/Done + welcome)\nPrismaClient singleton · $transaction (no P2028 double-tx)", fill="#ffffff", mono_body=True)
    box(el, 690, 1050, 620, 95, "Env — server/.env (gitignored)",
        "DATABASE_URL (pooled) · DIRECT_URL (migrate) · JWT_SECRET 32+\nFRONTEND_ORIGIN · PORT · KANBAN_USER_ID / TOKEN (MCP)", fill=ORANGE, mono_body=True)

    # ---- db interior
    box(el, 1370, 175, 520, 130, "User",
        "id · email UNIQUE · passwordHash (bcrypt 12)\nrefreshTokenHash? · 1—N Column, Task", fill="#ffffff", mono_body=True)
    box(el, 1370, 315, 520, 130, "Column",
        "id · userId → User CASCADE · title · position\n@@index(userId, position)", fill="#ffffff", mono_body=True)
    box(el, 1370, 455, 255, 220, "Task",
        "id · userId · columnId → Column\ntitle · description · priority\ntags[] · archived · position\nprojectKey · agentState · gitEnabled\nbranch? · lastCommit?", fill="#ffffff", mono_body=True)
    box(el, 1635, 455, 255, 220, "TaskEvent (journal)",
        "id · userId · taskId (NO FK!)\ntaskTitle snapshot · type · summary\ndetail? · from/toColumn?\n@@index(userId, createdAt)", fill=YELLOW, mono_body=True)
    box(el, 1370, 685, 520, 130, "Why no FK TaskEvent → Task?",
        "archive / delete keeps history\nbadge counts via groupBy(taskId)\nfeed newest-first, timeline oldest-first", fill="#ffffff")
    box(el, 1370, 825, 520, 130, "Migrations",
        "20260919 init (User/Column/Task)\n20260926 add_task_events\n20261006 add_agent_git", fill="#ffffff", mono_body=True)
    box(el, 1370, 965, 520, 115, "Retention (new)",
        "DELETE /journal/:id · DELETE /journal\n?before= ?taskId= ?type= · tasks untouched\nindexes keep feed fast", fill=YELLOW, mono_body=True)

    # ---- cross-container arrows
    arrow(el, 630, 330, 690, 330, "REST JSON :4000")
    arrow(el, 630, 590, 690, 590, "cookies kb_at/kb_rt")
    arrow(el, 1310, 985, 1370, 985, "Prisma pooled")
    text(el, 640, 1000, 720, 60,
         "every board + journal query scoped by userId from verified JWT",
         size=14)

    # footer strip
    rect(el, 30, 1190, 1880, 60, PURPLE)
    text(el, 40, 1196, 1860, 48,
         "Single-tenant lock (register 403 after 1st user)  ·  SameSite=Lax dev / None+Secure prod  ·  Frontend auto-refresh on 401  ·  Journal failures never break board mutations",
         size=15)
    return scene(el)


# ---------------------------------------------------------------- MCP
def build_mcp():
    el = []
    text(el, 40, 20, 1900, 60, "Kanban Board — MCP Path (agent → board, stdio)", size=34)
    text(el, 40, 75, 1900, 30,
         "OpenCode agent drives the same board + journal as the web UI — no HTTP, no cookies. Writes are journalled identically.",
         size=17)

    rect(el, 30, 120, 420, 760, PURPLE)                      # agent
    text(el, 40, 128, 400, 34, "AGENT  —  OpenCode", size=20)
    rect(el, 470, 120, 760, 760, BLUE)                       # server
    text(el, 480, 128, 740, 34, "MCP SERVER  —  server/src/mcp.ts (kanban v0.2.0)", size=20)
    rect(el, 1250, 120, 660, 760, GREEN)                     # data
    text(el, 1260, 128, 640, 34, "DATA  —  Prisma + files", size=20)

    # agent interior
    box(el, 50, 175, 380, 130, "opencode.jsonc",
        '"kanban": { type: local,\n  command: [npx, tsx,\n    server/src/mcp.ts] }', fill="#ffffff", mono_body=True)
    box(el, 50, 315, 380, 130, "Auth env (server/.env)",
        "KANBAN_TOKEN (login JWT, verified)\nor KANBAN_USER_ID (local trusted)\nresolved per tool call, not at boot", fill=ORANGE, mono_body=True)
    box(el, 50, 455, 380, 140, "Protocol — stdio JSON-RPC",
        "initialize → tools/list → tools/call\ncontent: [{ type: text, JSON }]\nno resources / prompts (tools only)", fill="#ffffff", mono_body=True)
    box(el, 50, 605, 380, 130, "project keys → paths",
        "tool results embed projectRoot\nfrom server/project-roots.json\n{ zex: F:/projects/zex } (gitignored)", fill="#ffffff", mono_body=True)
    box(el, 50, 745, 380, 110, "Example loop",
        "list_today → get_task →\nupdate_status(Running) → add_note\n→ update_status(Done)", fill=YELLOW)

    # server interior
    box(el, 490, 175, 720, 100, "Transport + SDK",
        "@modelcontextprotocol/sdk · McpServer + StdioServerTransport\nzod input schemas (dep declared, not transitive)", fill="#ffffff", mono_body=True)
    box(el, 490, 285, 350, 120, "READ tools (no journal)",
        "list_today {limit?} — due=today, prio-rank\nlist_by_date {date, project?, limit?}\nget_task {id} (+projectRoot)", fill=GREEN, mono_body=True)
    box(el, 850, 285, 360, 120, "WRITE tools (journalled!)",
        "update_status {id, column?, agentState?,\n  branch?, lastCommit?} — like PATCH\nadd_note {id, text≤2000} — like POST notes", fill=YELLOW, mono_body=True)
    box(el, 490, 415, 350, 120, "RETENTION tools (new)",
        "delete_note {id} → deleteOne()\nprune_journal {before?, taskId?,\n  type?} → prune() (≥1 filter)", fill=YELLOW, mono_body=True)
    box(el, 850, 415, 360, 120, "Parity fixes (v0.2.0)",
        "validBranch/validCommit (.., @, //, .lock)\nnote summary slice(0,117)+…\nupdate_status renumbers + records\nmoved / agent-* / git-commit", fill="#ffffff")
    box(el, 490, 545, 720, 120, "update_status detail",
        "column Todo/Doing/Done → find column by title → move to end\nrecords moved + agent + commit entries (REST-identical)\nreturns updated task JSON", fill="#ffffff")
    box(el, 490, 675, 720, 120, "Limits (by design)",
        "stdio only — index.ts never mounts MCP over HTTP\nno registerResource / registerPrompt\nproject-roots.json absolute paths (local only)", fill=RED)

    # data interior
    box(el, 1270, 175, 620, 130, "Reads — getBoardState(userId)",
        "columns orderBy position · tasks orderBy position\n+ projectRoot(task.projectKey) enrichment", fill="#ffffff", mono_body=True)
    box(el, 1270, 315, 620, 150, "Writes — prisma + journal.ts",
        "task.update / taskEvent.create\nrecord({userId, taskId, taskTitle,\n  type, summary, detail?, from/toColumn})", fill=YELLOW, mono_body=True)
    box(el, 1270, 475, 305, 140, "Tables touched",
        "Task (status/column/branch)\nTaskEvent (note/moved/agent\n  delete/prune)", fill="#ffffff", mono_body=True)
    box(el, 1585, 475, 305, 140, "Tables NEVER touched",
        "User · Column (update_status\nmoves cards, never edits lists)\nno auth/cookie writes", fill="#ffffff")
    box(el, 1270, 625, 620, 130, "Verified live",
        "stdio smoke: initialize → tools/list\n7 tools returned, version 0.2.0\ntsc --noEmit clean", fill=GREEN, mono_body=True)

    # arrows
    arrow(el, 450, 520, 490, 520, "stdio")
    arrow(el, 1210, 380, 1270, 380, "reads")
    arrow(el, 1210, 545, 1270, 545, "writes+journal")
    arrow(el, 1210, 700, 1270, 700, "prune/delete")

    # REST vs MCP strip
    rect(el, 30, 900, 1880, 150, GRAY)
    text(el, 40, 908, 1860, 134,
         "REST vs MCP — same truth, different doors\n"
         "WEB: cookies (kb_at 15m / kb_rt 30d) → requireAuth → routes/board.ts → prisma + record()      |      MCP: KANBAN_TOKEN/USER_ID → resolveUser() per call → same prisma + record()\n"
         "Both scope by userId · both validate (validate.ts) · both journal (journal.ts) · journal rows survive task delete (no FK) · retention endpoints keep TaskEvent bounded",
         size=16)

    # footer
    rect(el, 30, 1065, 1880, 60, PURPLE)
    text(el, 40, 1071, 1860, 48,
         "Resume line: stdio MCP server (7 tools) over existing Express+Prisma backend — agent status, git-isolation fields and journaled writes shared with the web UI",
         size=15)
    return scene(el)


def main():
    os.makedirs(HERE, exist_ok=True)
    arch = build_architecture()
    mcp = build_mcp()
    p1 = os.path.join(HERE, "kanban-architecture.excalidraw")
    p2 = os.path.join(HERE, "kanban-mcp.excalidraw")
    with open(p1, "w", encoding="utf-8") as f:
        json.dump(arch, f, ensure_ascii=False)
    with open(p2, "w", encoding="utf-8") as f:
        json.dump(mcp, f, ensure_ascii=False)
    print(f"wrote {p1} ({len(arch['elements'])} elements)")
    print(f"wrote {p2} ({len(mcp['elements'])} elements)")


if __name__ == "__main__":
    main()
