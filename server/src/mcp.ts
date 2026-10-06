#!/usr/bin/env node
/**
 * Kanban MCP server (stdio). Thin wrapper over the existing board queries.
 * Auth: KANBAN_TOKEN (JWT, verified) or KANBAN_USER_ID (local trusted).
 * Project paths: server/project-roots.json {"zex":"F:/projects/zex"}.
 */
import { config as loadEnv } from 'dotenv';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// dotenv/config resolves from the process cwd (the board root when OpenCode
// spawns us), but our .env lives next to this file's package. Load it first,
// before the modules below evaluate: tokens.ts reads env at import time.
// eslint-disable-next-line @typescript-eslint/no-require-imports
loadEnv({ path: join(__dirname, '..', '.env') });
const { prisma } = require('./db') as typeof import('./db');
const { verifyAccess } = require('./tokens') as typeof import('./tokens');
const { getBoardState } = require('./board') as typeof import('./board');

function resolveUser(): string {
  const token = process.env.KANBAN_TOKEN;
  if (token) {
    const sub = verifyAccess(token);
    if (!sub) throw new Error('Invalid KANBAN_TOKEN');
    return sub;
  }
  const id = process.env.KANBAN_USER_ID;
  if (!id) throw new Error('Set KANBAN_TOKEN or KANBAN_USER_ID (see server/.env.example)');
  return id;
}

function projectRoot(projectKey: string): string | null {
  if (!projectKey) return null;
  try {
    const file = join(__dirname, '..', 'project-roots.json');
    if (!existsSync(file)) return null;
    const map = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>;
    return typeof map[projectKey] === 'string' ? map[projectKey] : null;
  } catch {
    return null;
  }
}

const RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };
const server = new McpServer({ name: 'kanban', version: '0.1.0' });
const userId = resolveUser();

server.tool(
  'list_today',
  'Today\'s open tasks, highest priority first.',
  { limit: z.number().int().min(1).max(50).optional() },
  async ({ limit }) => {
    const board = await getBoardState(userId);
    const today = new Date().toISOString().slice(0, 10);
    const tasks = board.tasks
      .filter((t) => !t.archived && t.dueDate === today)
      .sort((a, b) => (RANK[a.priority] ?? 1) - (RANK[b.priority] ?? 1))
      .slice(0, limit ?? 20)
      .map((t) => ({ ...t, projectRoot: projectRoot(t.projectKey) }));
    return { content: [{ type: 'text' as const, text: JSON.stringify(tasks) }] };
  },
);

server.tool(
  'list_by_date',
  'Tasks for a date (yyyy-mm-dd).',
  {
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    project: z.string().optional(),
    limit: z.number().int().min(1).max(50).optional(),
  },
  async ({ date, project, limit }) => {
    const board = await getBoardState(userId);
    const tasks = board.tasks
      .filter((t) => !t.archived && t.dueDate === date && (!project || t.projectKey === project))
      .sort((a, b) => (RANK[a.priority] ?? 1) - (RANK[b.priority] ?? 1))
      .slice(0, limit ?? 20)
      .map((t) => ({ ...t, projectRoot: projectRoot(t.projectKey) }));
    return { content: [{ type: 'text' as const, text: JSON.stringify(tasks) }] };
  },
);

server.tool('get_task', 'Full task by id.', { id: z.string() }, async ({ id }) => {
  const board = await getBoardState(userId);
  const task = board.tasks.find((t) => t.id === id);
  if (!task) throw new Error('not found');
  return {
    content: [
      { type: 'text' as const, text: JSON.stringify({ ...task, projectRoot: projectRoot(task.projectKey) }) },
    ],
  };
});

server.tool(
  'update_status',
  'Move task between Todo/Doing/Done via column title and set agent state.',
  {
    id: z.string(),
    column: z.enum(['Todo', 'Doing', 'Done']).optional(),
    agentState: z.enum(['idle', 'running', 'under-review', 'completed']).optional(),
    branch: z.string().max(128).optional(),
    lastCommit: z.string().regex(/^[0-9a-f]{7,40}$/i).optional(),
  },
  async ({ id, column, agentState, branch, lastCommit }) => {
    const task = await prisma.task.findFirst({ where: { id, userId } });
    if (!task) throw new Error('not found');
    const data: Record<string, unknown> = {};
    if (column) {
      const col = await prisma.column.findFirst({ where: { userId, title: column } });
      if (!col) throw new Error(`no list "${column}"`);
      data.columnId = col.id;
    }
    if (agentState) data.agentState = agentState;
    if (branch !== undefined) data.branch = branch;
    if (lastCommit !== undefined) data.lastCommit = lastCommit;
    await prisma.task.update({ where: { id }, data });
    const board = await getBoardState(userId);
    return { content: [{ type: 'text' as const, text: JSON.stringify(board.tasks.find((t) => t.id === id)) }] };
  },
);

server.tool('add_note', 'Append journal note to a task.', { id: z.string(), text: z.string().min(1).max(2000) }, async ({ id, text }) => {
  const task = await prisma.task.findFirst({ where: { id, userId } });
  if (!task) throw new Error('not found');
  const event = await prisma.taskEvent.create({
    data: { userId, taskId: id, taskTitle: task.title, type: 'note', summary: text.slice(0, 120), detail: text },
  });
  return { content: [{ type: 'text' as const, text: JSON.stringify({ id: event.id, createdAt: event.createdAt }) }] };
});

async function main() {
  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
