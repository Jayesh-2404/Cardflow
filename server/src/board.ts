import { prisma } from './db';
import type { PrismaClient } from '@prisma/client';
import { toDateString } from './validate';
import {
  COLUMN_TITLES,
  deriveAgentState,
  isColumnKind,
  type AgentState,
  type ColumnKind,
} from './column-kinds';

export interface BoardColumnDTO {
  id: string;
  title: string;
  kind: ColumnKind;
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
  agentState: AgentState;
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

export async function getBoardState(userId: string): Promise<BoardDTO> {
  const [columns, tasks] = await Promise.all([
    prisma.column.findMany({
      where: { userId },
      // position is authoritative; the rest is a deterministic tiebreak so two
      // rows written in the same millisecond cannot swap places between reads.
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    }),
    prisma.task.findMany({
      where: { userId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      include: {
        runs: {
          orderBy: { startedAt: 'desc' },
          take: 1,
          select: { status: true },
        },
      },
    }),
  ]);
  const kindById = new Map<string, ColumnKind>();
  const outColumns = columns.map((c) => {
    const kind: ColumnKind = isColumnKind(c.kind) ? c.kind : 'active';
    kindById.set(c.id, kind);
    return { id: c.id, title: c.title, kind };
  });
  return {
    columns: outColumns,
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
      agentState: deriveAgentState(kindById.get(t.columnId) ?? 'active', t.runs[0]?.status),
      gitEnabled: t.gitEnabled ?? false,
      branch: t.branch ?? null,
      lastCommit: t.lastCommit ?? null,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    })),
  };
}

/**
 * Default four lists + welcome task. Used on register, board reset and import.
 *
 * The lists are fixed by kind, not by title: Todo, Doing, Under Review, Done.
 * The user may rename or reorder them, but cannot add a fifth.
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
  const todo = await db.column.create({
    data: { userId, title: COLUMN_TITLES.todo, kind: 'todo', position: 0 },
  });
  await db.column.create({
    data: { userId, title: COLUMN_TITLES.active, kind: 'active', position: 1 },
  });
  await db.column.create({
    data: { userId, title: COLUMN_TITLES.review, kind: 'review', position: 2 },
  });
  await db.column.create({
    data: { userId, title: COLUMN_TITLES.done, kind: 'done', position: 3 },
  });
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
