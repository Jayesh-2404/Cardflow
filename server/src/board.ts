import { prisma } from './db';
import type { PrismaClient } from '@prisma/client';
import { toDateString } from './validate';

export interface BoardColumnDTO {
  id: string;
  title: string;
}

export interface BoardTaskDTO {
  id: string;
  columnId: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  dueDate: string | null;
  tags: string[];
  archived: boolean;
  projectKey: string;
  agentState: 'idle' | 'running' | 'under-review' | 'completed';
  gitEnabled: boolean;
  branch: string | null;
  lastCommit: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BoardDTO {
  columns: BoardColumnDTO[];
  tasks: BoardTaskDTO[];
}

const PRIORITIES = new Set(['low', 'medium', 'high']);
const AGENT_STATES = new Set(['idle', 'running', 'under-review', 'completed']);

export async function getBoardState(userId: string): Promise<BoardDTO> {
  const [columns, tasks] = await Promise.all([
    prisma.column.findMany({ where: { userId }, orderBy: { position: 'asc' } }),
    prisma.task.findMany({ where: { userId }, orderBy: { position: 'asc' } }),
  ]);
  return {
    columns: columns.map((c) => ({ id: c.id, title: c.title })),
    tasks: tasks.map((t) => ({
      id: t.id,
      columnId: t.columnId,
      title: t.title,
      description: t.description,
      priority: (PRIORITIES.has(t.priority) ? t.priority : 'medium') as BoardTaskDTO['priority'],
      dueDate: toDateString(t.dueDate),
      tags: t.tags,
      archived: t.archived,
      projectKey: t.projectKey ?? '',
      agentState: (
        AGENT_STATES.has(t.agentState) ? t.agentState : 'idle'
      ) as BoardTaskDTO['agentState'],
      gitEnabled: t.gitEnabled ?? false,
      branch: t.branch ?? null,
      lastCommit: t.lastCommit ?? null,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    })),
  };
}

/**
 * Default Todo/Doing/Done + welcome task. Used on register and board reset.
 *
 * Takes an optional transaction client so callers that are already inside a
 * transaction (board reset) do not open a second one — two concurrent
 * interactive transactions exhaust the pooled Postgres connection and fail
 * with P2028.
 */
export async function seedDefaults(
  userId: string,
  db: Pick<PrismaClient, 'column' | 'task' | 'taskEvent'> = prisma,
): Promise<void> {
  const now = new Date();
  const todo = await db.column.create({ data: { userId, title: 'Todo', position: 0 } });
  await db.column.create({ data: { userId, title: 'Doing', position: 1 } });
  await db.column.create({ data: { userId, title: 'Done', position: 2 } });
  const welcome = await db.task.create({
    data: {
      userId,
      columnId: todo.id,
      title: 'Welcome — drag me to Doing',
      description: 'Press N for a new task, / to filter, Ctrl+K for commands.',
      priority: 'medium',
      tags: ['start'],
      position: 0,
      createdAt: now,
      updatedAt: now,
    },
  });
  // Journal the seed too, so a fresh or reset board has a truthful timeline.
  await db.taskEvent.create({
    data: {
      userId,
      taskId: welcome.id,
      taskTitle: welcome.title,
      type: 'created',
      summary: 'Created in Todo',
      toColumn: 'Todo',
      createdAt: now,
    },
  });
}
