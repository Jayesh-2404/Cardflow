#!/usr/bin/env node
/**
 * Kanban MCP server (stdio). A thin HTTP client over the board API's
 * `/api/mcp/*` door — it holds no Prisma client, so startup is immediate and
 * every write goes through the same journal, SSE bump and validation as the
 * web app.
 *
 * Auth: KANBAN_MCP_TOKEN (static bearer) + KANBAN_MCP_USER_ID (board owner),
 * both in server/.env. API base: KANBAN_API_URL, default http://localhost:4000.
 * Project paths: server/project-roots.json {"zex":"F:/projects/zex"}.
 */
import { config as loadEnv } from 'dotenv';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import type { BoardDTO } from './board';
import { isDoneTitle, selectOpenTasks, todayInTz } from './mcp-filters';

// OpenCode spawns us from the board root; our .env lives next to this package.
loadEnv({ path: join(__dirname, '..', '.env') });

const API_BASE = (process.env.KANBAN_API_URL?.trim() || 'http://localhost:4000').replace(/\/+$/, '');

function authToken(): string {
  const token = process.env.KANBAN_MCP_TOKEN?.trim();
  if (!token) {
    throw new Error(
      'KANBAN_MCP_TOKEN is not set. Add KANBAN_MCP_TOKEN and KANBAN_MCP_USER_ID to server/.env (see server/.env.example).',
    );
  }
  return token;
}

interface ApiErrorBody {
  error?: unknown;
}

/** One JSON call to the API, with failures phrased for a human reading a tool result. */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken()}`,
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new Error(
      `The board API is not reachable at ${API_BASE}. Start it with "cd server && npm run dev".`,
    );
  }

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body
        ? String((body as ApiErrorBody).error)
        : text || res.statusText;
    throw new Error(`Board API ${res.status}: ${message}`);
  }
  return body as T;
}

async function getBoard(): Promise<BoardDTO> {
  const body = await request<{ board: BoardDTO }>('/api/mcp');
  return body.board;
}

function rootsFile(): string {
  return join(__dirname, '..', 'project-roots.json');
}

function readRoots(): Record<string, string> {
  try {
    if (!existsSync(rootsFile())) return {};
    const map = JSON.parse(readFileSync(rootsFile(), 'utf8')) as Record<string, string>;
    return map;
  } catch {
    return {};
  }
}

function projectRoot(projectKey: string): string | null {
  if (!projectKey) return null;
  const map = readRoots();
  return typeof map[projectKey] === 'string' ? map[projectKey] : null;
}

interface RootHealth {
  key: string;
  path: string;
  exists: boolean;
  directory: boolean;
  git: boolean;
}

/** The local half of board_health: paths only this machine can check. */
function rootHealth(): RootHealth[] {
  return Object.entries(readRoots())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, path]) => {
      const exists = typeof path === 'string' && existsSync(path);
      const directory = exists ? statSync(path).isDirectory() : false;
      return {
        key,
        path,
        exists,
        directory,
        git: directory && existsSync(join(path, '.git')),
      };
    });
}

const server = new McpServer({ name: 'kanban', version: '0.3.0' });

server.tool(
  'board_health',
  'Check the board API, database, owner account and local project roots. Run this first when a tool fails.',
  {},
  async () => {
    const localRoots = rootHealth();
    let remote: unknown;
    try {
      remote = await request<unknown>('/api/mcp/health');
    } catch (err) {
      remote = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({ apiBase: API_BASE, remote, localRoots }, null, 2),
        },
      ],
    };
  },
);

server.tool(
  'list_today',
  "Today's open tasks, highest priority first. Cards already in a Done list are excluded.",
  { limit: z.number().int().min(1).max(50).optional() },
  async ({ limit }) => {
    const board = await getBoard();
    const tasks = selectOpenTasks({
      tasks: board.tasks,
      columns: board.columns,
      date: todayInTz(),
      limit,
    }).map((t) => ({ ...t, projectRoot: projectRoot(t.projectKey) }));
    return { content: [{ type: 'text' as const, text: JSON.stringify(tasks) }] };
  },
);

server.tool(
  'list_by_date',
  'Open tasks for a date (yyyy-mm-dd). Pass includeDone to also return finished cards.',
  {
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    project: z.string().optional(),
    limit: z.number().int().min(1).max(50).optional(),
    includeDone: z.boolean().optional(),
  },
  async ({ date, project, limit, includeDone }) => {
    const board = await getBoard();
    const tasks = selectOpenTasks({
      tasks: board.tasks,
      columns: board.columns,
      date,
      project,
      limit,
      excludeDone: !includeDone,
    }).map((t) => ({ ...t, projectRoot: projectRoot(t.projectKey) }));
    return { content: [{ type: 'text' as const, text: JSON.stringify(tasks) }] };
  },
);

server.tool('get_task', 'Full task by id.', { id: z.string() }, async ({ id }) => {
  const board = await getBoard();
  const task = board.tasks.find((t) => t.id === id);
  if (!task) throw new Error('not found');
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ ...task, projectRoot: projectRoot(task.projectKey) }),
      },
    ],
  };
});

server.tool(
  'update_status',
  "Move task between Todo/Doing/Under Review via column title and set agent state. Never mark a card Done — use agentState 'under-review' and let a human close it. Journalled like the REST API.",
  {
    id: z.string(),
    column: z.string().min(1).max(60).optional(),
    agentState: z.enum(['idle', 'running', 'under-review', 'completed']).optional(),
    branch: z.string().max(128).optional(),
    lastCommit: z.string().regex(/^[0-9a-f]{7,40}$/i).optional(),
  },
  async ({ id, column, agentState, branch, lastCommit }) => {
    if (column !== undefined && isDoneTitle(column)) {
      throw new Error(
        "Agents must not move a card to Done. Move it to 'Under Review' and let a human close it.",
      );
    }
    const body: Record<string, unknown> = {};
    if (column !== undefined) body.column = column;
    if (agentState !== undefined) body.agentState = agentState;
    if (branch !== undefined) body.branch = branch;
    if (lastCommit !== undefined) body.lastCommit = lastCommit;
    if (Object.keys(body).length === 0) throw new Error('nothing to update');

    const result = await request<{ board: BoardDTO }>(
      `/api/mcp/tasks/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify(body) },
    );
    const task = result.board.tasks.find((t) => t.id === id);
    return { content: [{ type: 'text' as const, text: JSON.stringify(task) }] };
  },
);

server.tool(
  'add_note',
  'Append journal note to a task.',
  { id: z.string(), text: z.string().min(1).max(2000) },
  async ({ id, text }) => {
    const body = text.trim().slice(0, 2000);
    if (!body) throw new Error('note required');
    const event = await request<{ event: { id: string; createdAt: string } }>(
      `/api/mcp/tasks/${encodeURIComponent(id)}/notes`,
      { method: 'POST', body: JSON.stringify({ note: body }) },
    );
    return { content: [{ type: 'text' as const, text: JSON.stringify(event) }] };
  },
);

server.tool(
  'delete_note',
  'Delete one journal entry by id. The task stays.',
  { id: z.string() },
  async ({ id }) => {
    const result = await request<{ ok: boolean }>(
      `/api/mcp/journal/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    );
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
  },
);

server.tool(
  'prune_journal',
  'Bulk delete journal entries to bound DB growth. At least one filter required.',
  {
    before: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    taskId: z.string().optional(),
    type: z
      .enum([
        'created',
        'updated',
        'moved',
        'archived',
        'unarchived',
        'note',
        'deleted',
        'agent-started',
        'agent-review',
        'agent-completed',
        'git-commit',
      ])
      .optional(),
  },
  async ({ before, taskId, type }) => {
    if (!before && !taskId && !type) {
      throw new Error('at least one filter required (before, taskId, type)');
    }
    const params = new URLSearchParams();
    if (before) params.set('before', before);
    if (taskId) params.set('taskId', taskId);
    if (type) params.set('type', type);
    const result = await request<{ deleted: number }>(`/api/mcp/journal?${params}`, {
      method: 'DELETE',
    });
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
  },
);

async function main() {
  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
