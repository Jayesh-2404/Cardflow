#!/usr/bin/env node
/**
 * Kanban MCP server (stdio). Thin wrapper over the existing board queries.
 * Auth: KANBAN_TOKEN (JWT, verified) or KANBAN_USER_ID (local trusted).
 * Project paths: server/project-roots.json {"zex":"F:/projects/zex"}.
 *
 * Writes go through the same journal as the REST API so the board timeline
 * stays truthful no matter which client made the change.
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
const { record, deleteOne, prune } = require('./journal') as typeof import('./journal');
const { validBranch, validCommit } = require('./validate') as typeof import('./validate');
const { selectOpenTasks, todayInTz, agentColumn } =
  require('./mcp-filters') as typeof import('./mcp-filters');

function resolveUser(): string {
  const token = process.env.KANBAN_TOKEN;
  if (token) {
    const sub = verifyAccess(token);
    if (!sub) throw new Error('Invalid KANBAN_TOKEN (refresh with a fresh login JWT)');
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

/** Resolve per call (not at import) so the server can start and list tools even when auth env is missing. */
function userId(): string {
  return resolveUser();
}

function summarizeNote(body: string): string {
  return body.length > 120 ? `${body.slice(0, 117)}…` : body;
}

const server = new McpServer({ name: 'kanban', version: '0.2.0' });

server.tool(
  'list_today',
  "Today's open tasks, highest priority first. Cards already in a Done list are excluded.",
  { limit: z.number().int().min(1).max(50).optional() },
  async ({ limit }) => {
    const uid = userId();
    const board = await getBoardState(uid);
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
    const uid = userId();
    const board = await getBoardState(uid);
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
  const uid = userId();
  const board = await getBoardState(uid);
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
  "Move task between Todo/Doing via column title and set agent state. Never mark a card Done — use agentState 'under-review' and let a human close it. Journalled like the REST API.",
  {
    id: z.string(),
    column: agentColumn.optional(),
    agentState: z.enum(['idle', 'running', 'under-review', 'completed']).optional(),
    branch: z.string().max(128).optional(),
    lastCommit: z.string().regex(/^[0-9a-f]{7,40}$/i).optional(),
  },
  async ({ id, column, agentState, branch, lastCommit }) => {
    const uid = userId();
    const task = await prisma.task.findFirst({ where: { id, userId: uid } });
    if (!task) throw new Error('not found');
    if (branch !== undefined && !validBranch(branch)) throw new Error('bad branch');
    if (lastCommit !== undefined && !validCommit(lastCommit)) throw new Error('bad lastCommit');

    const data: Record<string, unknown> = {};
    let toColumnTitle: string | null = null;
    let fromColumnTitle: string | null = null;
    if (column) {
      const col = await prisma.column.findFirst({ where: { userId: uid, title: column } });
      if (!col) throw new Error(`no list "${column}"`);
      if (col.id !== task.columnId) {
        const cols = await prisma.column.findMany({ where: { userId: uid }, select: { id: true, title: true } });
        const titles = new Map(cols.map((c) => [c.id, c.title]));
        fromColumnTitle = titles.get(task.columnId) ?? null;
        toColumnTitle = titles.get(col.id) ?? column;
        const count = await prisma.task.count({ where: { userId: uid, columnId: col.id } });
        data.columnId = col.id;
        data.position = count;
      }
    }
    if (agentState) data.agentState = agentState;
    if (branch !== undefined) data.branch = branch;
    if (lastCommit !== undefined) data.lastCommit = lastCommit;
    if (Object.keys(data).length === 0) throw new Error('nothing to update');

    await prisma.task.update({ where: { id }, data });
    if (data.columnId) {
      // Keep the source list densely ordered, like PATCH /tasks/:id does.
      const remaining = await prisma.task.findMany({
        where: { userId: uid, columnId: task.columnId },
        orderBy: { position: 'asc' },
        select: { id: true },
      });
      await prisma.$transaction(
        remaining.map((t, i) => prisma.task.update({ where: { id: t.id }, data: { position: i } })),
      );
      await record({
        userId: uid,
        taskId: id,
        taskTitle: task.title,
        type: 'moved',
        summary: `Moved ${fromColumnTitle ?? 'list'} → ${toColumnTitle ?? 'list'}`,
        fromColumn: fromColumnTitle,
        toColumn: toColumnTitle,
      });
    }
    if (agentState && agentState !== task.agentState) {
      const type =
        agentState === 'running'
          ? ('agent-started' as const)
          : agentState === 'under-review'
            ? ('agent-review' as const)
            : agentState === 'completed'
              ? ('agent-completed' as const)
              : ('updated' as const);
      await record({
        userId: uid,
        taskId: id,
        taskTitle: task.title,
        type,
        summary:
          agentState === 'running'
            ? 'Agent started work'
            : agentState === 'under-review'
              ? 'Agent requested review'
              : agentState === 'completed'
                ? 'Marked completed after review'
                : `Agent state → ${agentState}`,
      });
    }
    if (lastCommit !== undefined && lastCommit && lastCommit !== task.lastCommit) {
      await record({
        userId: uid,
        taskId: id,
        taskTitle: task.title,
        type: 'git-commit',
        summary: `Committed ${lastCommit.slice(0, 7)}${branch ? ` on ${branch}` : ''}`,
        detail: lastCommit,
      });
    }
    const board = await getBoardState(uid);
    return { content: [{ type: 'text' as const, text: JSON.stringify(board.tasks.find((t) => t.id === id)) }] };
  },
);

server.tool('add_note', 'Append journal note to a task.', { id: z.string(), text: z.string().min(1).max(2000) }, async ({ id, text }) => {
  const uid = userId();
  const task = await prisma.task.findFirst({ where: { id, userId: uid } });
  if (!task) throw new Error('not found');
  const body = text.trim().slice(0, 2000);
  if (!body) throw new Error('note required');
  const event = await prisma.taskEvent.create({
    data: { userId: uid, taskId: id, taskTitle: task.title, type: 'note', summary: summarizeNote(body), detail: body },
  });
  return { content: [{ type: 'text' as const, text: JSON.stringify({ id: event.id, createdAt: event.createdAt }) }] };
});

server.tool(
  'delete_note',
  'Delete one journal entry by id. The task stays.',
  { id: z.string() },
  async ({ id }) => {
    const uid = userId();
    const ok = await deleteOne(uid, id);
    if (!ok) throw new Error('not found');
    return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true }) }] };
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
    const uid = userId();
    if (!before && !taskId && !type) throw new Error('at least one filter required (before, taskId, type)');
    const deleted = await prune(uid, {
      before: before ? new Date(`${before}T00:00:00.000Z`) : undefined,
      taskId,
      type,
    });
    return { content: [{ type: 'text' as const, text: JSON.stringify({ deleted }) }] };
  },
);

async function main() {
  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
