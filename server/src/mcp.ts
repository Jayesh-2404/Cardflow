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
import type { BoardDTO, BoardTaskDTO } from './board';
import { selectOpenTasks, todayInTz } from './mcp-filters';

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

function readLocalRoots(): Record<string, string> {
  try {
    if (!existsSync(rootsFile())) return {};
    const map = JSON.parse(readFileSync(rootsFile(), 'utf8')) as Record<string, string>;
    return map;
  } catch {
    return {};
  }
}

interface BoardProject {
  key: string;
  name: string;
  rootPath: string;
}

async function readBoardProjects(): Promise<BoardProject[]> {
  try {
    const body = await request<{ projects: BoardProject[] }>('/api/mcp/projects');
    return body.projects;
  } catch {
    return [];
  }
}

interface RootInfo {
  key: string;
  path: string;
  source: 'board' | 'local';
  exists: boolean;
  directory: boolean;
  git: boolean;
}

/**
 * One list of roots for this machine. The board's Projects panel is the shared
 * default; project-roots.json is a local override so two laptops can point the
 * same project key at different checkouts.
 */
async function availableRoots(): Promise<RootInfo[]> {
  const merged = new Map<string, { path: string; source: 'board' | 'local' }>();
  for (const project of await readBoardProjects()) {
    if (project.key && project.rootPath) {
      merged.set(project.key, { path: project.rootPath, source: 'board' });
    }
  }
  for (const [key, path] of Object.entries(readLocalRoots())) {
    if (typeof path === 'string' && path) merged.set(key, { path, source: 'local' });
  }
  return [...merged.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, { path, source }]) => {
      let exists = false;
      let directory = false;
      try {
        exists = existsSync(path);
        directory = exists && statSync(path).isDirectory();
      } catch {
        exists = false;
      }
      return {
        key,
        path,
        source,
        exists,
        directory,
        git: directory && existsSync(join(path, '.git')),
      };
    });
}

function rootFor(projectKey: string, roots: RootInfo[]): string | null {
  if (!projectKey) return null;
  return roots.find((r) => r.key === projectKey)?.path ?? null;
}

const server = new McpServer({ name: 'kanban', version: '0.3.0' });

server.tool(
  'board_health',
  'Check the board API, database, owner account and local project roots. Run this first when a tool fails.',
  {},
  async () => {
    const projectRoots = await availableRoots();
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
          text: JSON.stringify({ apiBase: API_BASE, remote, projectRoots }, null, 2),
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
    const roots = await availableRoots();
    const tasks = selectOpenTasks({
      tasks: board.tasks,
      columns: board.columns,
      date: todayInTz(),
      limit,
    }).map((t) => ({ ...t, projectRoot: rootFor(t.projectKey, roots) }));
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
    const roots = await availableRoots();
    const tasks = selectOpenTasks({
      tasks: board.tasks,
      columns: board.columns,
      date,
      project,
      limit,
      excludeDone: !includeDone,
    }).map((t) => ({ ...t, projectRoot: rootFor(t.projectKey, roots) }));
    return { content: [{ type: 'text' as const, text: JSON.stringify(tasks) }] };
  },
);

server.tool('get_task', 'Full task by id.', { id: z.string() }, async ({ id }) => {
  const board = await getBoard();
  const task = board.tasks.find((t) => t.id === id);
  if (!task) throw new Error('not found');
  const roots = await availableRoots();
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ ...task, projectRoot: rootFor(task.projectKey, roots) }),
      },
    ],
  };
});

server.tool(
  'pick_task',
  "Claim the next card from Todo and move it to Doing. Order: high > medium > low priority, then due date (overdue first, undated last), then board order. Only cards whose project has a usable root on this machine. Call once, then work the returned card in projectRoot on the returned branch.",
  {
    runner: z.string().min(1).max(40).optional(),
    model: z.string().max(120).optional(),
    project: z.string().max(64).optional(),
  },
  async ({ runner, model, project }) => {
    const roots = await availableRoots();
    const usable = roots.filter((r) => r.exists && r.directory);
    if (usable.length === 0) {
      throw new Error(
        'No project root is available on this machine. Add one in the board Projects panel, or set server/project-roots.json.',
      );
    }
    const allowed = project ? usable.filter((r) => r.key === project) : usable;
    if (allowed.length === 0) {
      const known = usable.map((r) => r.key).join(', ');
      throw new Error(`No usable project root "${project}". Known roots: ${known}`);
    }
    const result = await request<{ task: BoardTaskDTO | null; branch?: string }>(
      '/api/mcp/pick',
      {
        method: 'POST',
        body: JSON.stringify({
          runner: runner ?? process.env.KANBAN_MCP_RUNNER ?? 'opencode',
          model: model ?? process.env.KANBAN_MCP_MODEL ?? null,
          projects: allowed.map((r) => r.key),
        }),
      },
    );
    if (!result.task) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ task: null, reason: 'No claimable Todo card.' }),
          },
        ],
      };
    }
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            ...result.task,
            projectRoot: rootFor(result.task.projectKey, roots),
            branch: result.branch,
          }),
        },
      ],
    };
  },
);

server.tool(
  'heartbeat_task',
  'Refresh the heartbeat on a claimed card. Call it between long steps so the board can tell a slow run from a dead one.',
  { id: z.string() },
  async ({ id }) => {
    const result = await request<{ ok: boolean; heartbeatAt: string }>(
      `/api/mcp/tasks/${encodeURIComponent(id)}/heartbeat`,
      { method: 'POST', body: JSON.stringify({}) },
    );
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
  },
);

server.tool(
  'finish_task',
  "Move the claimed card to Under Review. Call after the branch is committed and pushed, and after the PR is opened when gitEnabled is true. Never marks Done and never merges.",
  {
    id: z.string(),
    branch: z.string().max(128).optional(),
    lastCommit: z.string().regex(/^[0-9a-f]{7,40}$/i).optional(),
    prUrl: z.string().max(500).optional(),
    prNumber: z.number().int().min(1).max(999_999_999).optional(),
    summary: z.string().max(2000).optional(),
  },
  async ({ id, branch, lastCommit, prUrl, prNumber, summary }) => {
    const result = await request<{ board: BoardDTO }>('/api/mcp/tasks/' + encodeURIComponent(id) + '/finish', {
      method: 'POST',
      body: JSON.stringify({ branch, lastCommit, prUrl, prNumber, summary }),
    });
    const task = result.board.tasks.find((t) => t.id === id);
    const roots = await availableRoots();
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(task ? { ...task, projectRoot: rootFor(task.projectKey, roots) } : task),
        },
      ],
    };
  },
);

server.tool(
  'release_task',
  'Give a claimed card back to Todo when the run cannot continue. The card keeps its journal and the run is marked abandoned.',
  { id: z.string(), reason: z.string().max(1000).optional() },
  async ({ id, reason }) => {
    const result = await request<{ board: BoardDTO }>('/api/mcp/tasks/' + encodeURIComponent(id) + '/release', {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    const task = result.board.tasks.find((t) => t.id === id);
    return { content: [{ type: 'text' as const, text: JSON.stringify(task) }] };
  },
);

server.tool(
  'update_status',
  "Move a task between lists by exact list title. Never move a card into a Done list — put it in Under Review and let a human close it. Journalled like the REST API.",
  {
    id: z.string(),
    column: z.string().min(1).max(60).optional(),
    agentState: z.enum(['idle', 'running', 'under-review', 'completed']).optional(),
    branch: z.string().max(128).optional(),
    lastCommit: z.string().regex(/^[0-9a-f]{7,40}$/i).optional(),
  },
  async ({ id, column, agentState, branch, lastCommit }) => {
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
