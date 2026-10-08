import { prisma } from './db';

/**
 * Append-only task journal. Every mutation that a human would want to be able
 * to look back on writes one entry here.
 */
export const EVENT_TYPES = [
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
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export interface JournalEventDTO {
  id: string;
  taskId: string;
  taskTitle: string;
  type: EventType;
  summary: string;
  detail: string | null;
  fromColumn: string | null;
  toColumn: string | null;
  createdAt: string;
}

interface EventRow {
  id: string;
  taskId: string;
  taskTitle: string;
  type: string;
  summary: string;
  detail: string | null;
  fromColumn: string | null;
  toColumn: string | null;
  createdAt: Date;
}

const TYPES = new Set<string>(EVENT_TYPES);

function toDTO(row: EventRow): JournalEventDTO {
  return {
    id: row.id,
    taskId: row.taskId,
    taskTitle: row.taskTitle,
    type: TYPES.has(row.type) ? (row.type as EventType) : 'updated',
    summary: row.summary,
    detail: row.detail,
    fromColumn: row.fromColumn,
    toColumn: row.toColumn,
    createdAt: row.createdAt.toISOString(),
  };
}

export function isEventType(v: unknown): v is EventType {
  return typeof v === 'string' && TYPES.has(v);
}

export interface RecordInput {
  userId: string;
  taskId: string;
  taskTitle: string;
  type: EventType;
  summary: string;
  detail?: string | null;
  fromColumn?: string | null;
  toColumn?: string | null;
}

/** Fire-and-forget journal write: never let logging break a board mutation. */
export async function record(input: RecordInput): Promise<void> {
  try {
    await prisma.taskEvent.create({
      data: {
        userId: input.userId,
        taskId: input.taskId,
        taskTitle: input.taskTitle.slice(0, 200),
        type: input.type,
        summary: input.summary.slice(0, 300),
        detail: input.detail ? input.detail.slice(0, 2000) : null,
        fromColumn: input.fromColumn ?? null,
        toColumn: input.toColumn ?? null,
      },
    });
  } catch {
    // journal is best-effort
  }
}

/** Newest first. */
export async function timelineFor(
  userId: string,
  taskId: string,
  limit = 200,
): Promise<JournalEventDTO[]> {
  const rows = await prisma.taskEvent.findMany({
    where: { userId, taskId },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 500),
  });
  return rows.map(toDTO);
}

/** Cross-task feed, newest first. */
export async function recent(userId: string, limit = 120): Promise<JournalEventDTO[]> {
  const rows = await prisma.taskEvent.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 500),
  });
  return rows.map(toDTO);
}

/** Journal entry count per task, for the badge on each card. */
export async function countsFor(userId: string): Promise<Record<string, number>> {
  const grouped = await prisma.taskEvent.groupBy({
    by: ['taskId'],
    where: { userId },
    _count: { _all: true },
  });
  const out: Record<string, number> = {};
  for (const g of grouped) out[g.taskId] = g._count._all;
  return out;
}

/** Delete one entry. Returns true if owned + deleted. */
export async function deleteOne(userId: string, id: string): Promise<boolean> {
  const r = await prisma.taskEvent.deleteMany({ where: { id, userId } });
  return r.count > 0;
}

export interface PruneFilter {
  before?: Date;
  taskId?: string;
  type?: EventType;
}

/** Bulk delete journal entries. At least one filter required to avoid full wipe. */
export async function prune(userId: string, filter: PruneFilter): Promise<number> {
  if (!filter.before && !filter.taskId && !filter.type) return 0;
  const where: { userId: string; createdAt?: { lt: Date }; taskId?: string; type?: string } = {
    userId,
  };
  if (filter.before) where.createdAt = { lt: filter.before };
  if (filter.taskId) where.taskId = filter.taskId;
  if (filter.type) where.type = filter.type;
  const r = await prisma.taskEvent.deleteMany({ where });
  return r.count;
}

/** Human label for a changed field, used in `updated` summaries. */
export const FIELD_LABELS: Record<string, string> = {
  title: 'title',
  description: 'details',
  priority: 'priority',
  dueDate: 'due date',
  tags: 'tags',
  archived: 'archive state',
  columnId: 'list',
  projectKey: 'project',
  agentState: 'agent state',
  gitEnabled: 'git isolation',
  branch: 'branch',
  lastCommit: 'commit',
};
