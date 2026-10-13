import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth, type AuthedRequest } from '../middleware';
import {
  cleanProjectKey,
  cleanTags,
  parseDueDate,
  toDateString,
  validAgentState,
  validBranch,
  validCommit,
  validPriority,
} from '../validate';
import { getBoardState, seedDefaults } from '../board';
import { addClient, bump, versionFor } from '../realtime';
import {
  countsFor,
  deleteOne,
  FIELD_LABELS,
  isEventType,
  prune,
  recent,
  record,
  timelineFor,
} from '../journal';

export const boardRouter = Router();
boardRouter.use(requireAuth);

function uid(req: unknown): string {
  return (req as AuthedRequest).userId;
}

async function renumberColumn(userId: string, columnId: string): Promise<void> {
  const tasks = await prisma.task.findMany({
    where: { userId, columnId },
    orderBy: { position: 'asc' },
    select: { id: true },
  });
  await prisma.$transaction(
    tasks.map((t, i) => prisma.task.update({ where: { id: t.id }, data: { position: i } })),
  );
}

/** List titles for the current user, keyed by id — used to phrase move events. */
async function columnTitles(userId: string): Promise<Map<string, string>> {
  const cols = await prisma.column.findMany({ where: { userId }, select: { id: true, title: true } });
  return new Map(cols.map((c) => [c.id, c.title]));
}

boardRouter.get('/', async (req, res) => {
  res.json({ board: await getBoardState(uid(req)) });
});

/** Live sync: one SSE stream per tab. Client refetches board + journal on push. */
boardRouter.get('/stream', async (req, res) => {
  const userId = uid(req);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write(`: connected v${versionFor(userId)}\n\n`);
  const remove = addClient(userId, res);
  const beat = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(beat);
      remove();
    }
  }, 25000);
  req.on('close', () => {
    clearInterval(beat);
    remove();
  });
});

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

/** Filtered task list for agents: ?due=today|yyyy-mm-dd&project=key&limit=20 */
boardRouter.get('/tasks', async (req, res) => {
  const userId = uid(req);
  const q = req.query as { due?: unknown; project?: unknown; limit?: unknown };
  let due: Date | null = null;
  if (q.due !== undefined) {
    const raw = typeof q.due === 'string' ? q.due : '';
    const day =
      raw === 'today' ? new Date().toISOString().slice(0, 10) : raw;
    try {
      due = parseDueDate(day);
    } catch {
      res.status(400).json({ error: 'bad due (use today or yyyy-mm-dd)' });
      return;
    }
  }
  const projectKey =
    typeof q.project === 'string' && q.project ? q.project.trim().toLowerCase().slice(0, 64) : null;
  const limitRaw = typeof q.limit === 'string' ? Number(q.limit) : 20;
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 50) : 20;

  const where: { userId: string; dueDate?: { gte: Date; lt: Date }; projectKey?: string } = {
    userId,
  };
  if (due) {
    const next = new Date(due.getTime() + 24 * 60 * 60 * 1000);
    where.dueDate = { gte: due, lt: next };
  }
  if (projectKey) where.projectKey = projectKey;

  const rows = await prisma.task.findMany({
    where,
    orderBy: { position: 'asc' },
    take: 200,
  });
  const ranked = rows
    .sort((a, b) => (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1))
    .slice(0, limit);
  const board = await getBoardState(userId);
  const byId = new Map(board.tasks.map((t) => [t.id, t]));
  res.json({ tasks: ranked.map((r) => byId.get(r.id)).filter(Boolean) });
});

/** Journal sidecar data: entry counts for card badges + the global feed. */
boardRouter.get('/journal', async (req, res) => {
  const userId = uid(req);
  const limitRaw = (req.query as { limit?: unknown }).limit;
  const limit = typeof limitRaw === 'string' ? Number(limitRaw) : 120;
  const [counts, events] = await Promise.all([
    countsFor(userId),
    recent(userId, Number.isFinite(limit) ? limit : 120),
  ]);
  res.json({ counts, events });
});

/**
 * Bulk prune journal entries to bound DB growth.
 * At least one filter required: ?before=yyyy-mm-dd&taskId=..&type=note
 * `before` deletes entries strictly older than that day (UTC).
 */
boardRouter.delete('/journal', async (req, res) => {
  const userId = uid(req);
  const q = req.query as { before?: unknown; taskId?: unknown; type?: unknown };
  let before: Date | null = null;
  if (q.before !== undefined) {
    if (typeof q.before !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(q.before)) {
      res.status(400).json({ error: 'bad before (use yyyy-mm-dd)' });
      return;
    }
    before = new Date(`${q.before}T00:00:00.000Z`);
    if (Number.isNaN(before.getTime())) {
      res.status(400).json({ error: 'bad before (use yyyy-mm-dd)' });
      return;
    }
  }
  const taskId = typeof q.taskId === 'string' && q.taskId ? q.taskId : undefined;
  const type = typeof q.type === 'string' && isEventType(q.type) ? q.type : undefined;
  if (typeof q.type === 'string' && q.type && !type) {
    res.status(400).json({ error: 'bad type' });
    return;
  }
  if (!before && !taskId && !type) {
    res.status(400).json({ error: 'at least one filter required (before, taskId, type)' });
    return;
  }
  const deleted = await prune(userId, { before: before ?? undefined, taskId, type });
  bump(userId);
  res.json({ deleted });
});

/** Delete one journal entry (keeps the task). */
boardRouter.delete('/journal/:id', async (req, res) => {
  const userId = uid(req);
  const ok = await deleteOne(userId, req.params.id);
  if (!ok) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  bump(userId);
  res.json({ ok: true });
});

/** Full timeline for a single task. */
boardRouter.get('/tasks/:id/timeline', async (req, res) => {
  const userId = uid(req);
  const task = await prisma.task.findFirst({
    where: { id: req.params.id, userId },
    select: { id: true },
  });
  if (!task) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  res.json({ events: await timelineFor(userId, task.id) });
});

/** Append a free-form journal note. */
boardRouter.post('/tasks/:id/notes', async (req, res) => {
  const userId = uid(req);
  const task = await prisma.task.findFirst({ where: { id: req.params.id, userId } });
  if (!task) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  const { note } = req.body as { note?: unknown };
  if (typeof note !== 'string' || !note.trim()) {
    res.status(400).json({ error: 'note required' });
    return;
  }
  const body = note.trim().slice(0, 2000);
  const event = await prisma.taskEvent.create({
    data: {
      userId,
      taskId: task.id,
      taskTitle: task.title,
      type: 'note',
      summary: body.length > 120 ? `${body.slice(0, 117)}…` : body,
      detail: body,
    },
  });
  bump(userId);
  res.status(201).json({
    event: {
      id: event.id,
      taskId: event.taskId,
      taskTitle: event.taskTitle,
      type: 'note',
      summary: event.summary,
      detail: event.detail,
      fromColumn: null,
      toColumn: null,
      createdAt: event.createdAt.toISOString(),
    },
  });
});

boardRouter.post('/columns', async (req, res) => {
  const userId = uid(req);
  const { title } = req.body as { title?: unknown };
  if (typeof title !== 'string' || !title.trim() || title.length > 60) {
    res.status(400).json({ error: 'title required (max 60 chars)' });
    return;
  }
  const count = await prisma.column.count({ where: { userId } });
  await prisma.column.create({
    data: { userId, title: title.trim(), position: count },
  });
  res.status(201).json({ board: await getBoardState(userId) });
});

/**
 * Persist a new list order. Body is the complete ordered list of column ids.
 * Declared before `/columns/:id` so "order" is not swallowed as an id.
 */
boardRouter.patch('/columns/order', async (req, res) => {
  const userId = uid(req);
  const { order } = req.body as { order?: unknown };
  if (!Array.isArray(order) || order.length === 0 || order.length > 50) {
    res.status(400).json({ error: 'order must be a non-empty array of column ids' });
    return;
  }
  if (!order.every((v) => typeof v === 'string')) {
    res.status(400).json({ error: 'order must contain only column ids' });
    return;
  }
  const ids = order as string[];

  const cols = await prisma.column.findMany({
    where: { userId },
    orderBy: { position: 'asc' },
    select: { id: true, title: true },
  });
  const owned = new Set(cols.map((c) => c.id));
  if (ids.length !== cols.length || new Set(ids).size !== ids.length || ids.some((id) => !owned.has(id))) {
    res.status(400).json({ error: 'order must list every list exactly once' });
    return;
  }

  const previousIndex = new Map(cols.map((c, i) => [c.id, i]));
  await prisma.$transaction(
    ids.map((id, i) => prisma.column.update({ where: { id }, data: { position: i } })),
  );

  // Journal only the lists that actually changed index, and only their cards,
  // so a reorder is recorded without stamping every card on the board.
  const movedTo = new Map<string, number>();
  ids.forEach((id, i) => {
    if (previousIndex.get(id) !== i) movedTo.set(id, i);
  });
  if (movedTo.size > 0) {
    const affected = await prisma.task.findMany({
      where: { userId, columnId: { in: [...movedTo.keys()] } },
      select: { id: true, title: true, columnId: true },
    });
    await Promise.all(
      affected.map((t) =>
        record({
          userId,
          taskId: t.id,
          taskTitle: t.title,
          type: 'updated',
          summary: `List moved to position ${(movedTo.get(t.columnId) ?? 0) + 1}`,
        }),
      ),
    );
  }
  bump(userId);
  res.json({ board: await getBoardState(userId) });
});

boardRouter.patch('/columns/:id', async (req, res) => {
  const userId = uid(req);
  const { title } = req.body as { title?: unknown };
  if (typeof title !== 'string' || !title.trim() || title.length > 60) {
    res.status(400).json({ error: 'title required (max 60 chars)' });
    return;
  }
  const col = await prisma.column.findFirst({ where: { id: req.params.id, userId } });
  if (!col) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  await prisma.column.update({ where: { id: col.id }, data: { title: title.trim() } });
  if (col.title !== title.trim()) {
    // One entry per card that changed lists, so the journal stays truthful.
    const moved = await prisma.task.findMany({
      where: { userId, columnId: col.id },
      select: { id: true, title: true },
    });
    await Promise.all(
      moved.map((t) =>
        record({
          userId,
          taskId: t.id,
          taskTitle: t.title,
          type: 'updated',
          summary: `List renamed to "${title.trim()}"`,
        }),
      ),
    );
  }
  bump(userId);
  res.json({ board: await getBoardState(userId) });
});

boardRouter.delete('/columns/:id', async (req, res) => {
  const userId = uid(req);
  const cols = await prisma.column.findMany({ where: { userId }, orderBy: { position: 'asc' } });
  if (cols.length <= 1) {
    res.status(400).json({ error: 'cannot delete the last list' });
    return;
  }
  const target = cols.find((c) => c.id === req.params.id);
  if (!target) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  const fallback = cols.find((c) => c.id !== target.id);
  if (!fallback) {
    res.status(400).json({ error: 'cannot delete the last list' });
    return;
  }
  await prisma.task.updateMany({
    where: { userId, columnId: target.id },
    data: { columnId: fallback.id },
  });
  await prisma.column.delete({ where: { id: target.id } });
  await renumberColumn(userId, fallback.id);
  bump(userId);
  res.json({ board: await getBoardState(userId) });
});

boardRouter.post('/tasks', async (req, res) => {
  const userId = uid(req);
  const { columnId, title, description, priority, dueDate, tags, projectKey, gitEnabled } =
    req.body as {
      columnId?: unknown;
      title?: unknown;
      description?: unknown;
      priority?: unknown;
      dueDate?: unknown;
      tags?: unknown;
      projectKey?: unknown;
      gitEnabled?: unknown;
    };
  if (typeof columnId !== 'string' || typeof title !== 'string' || !title.trim()) {
    res.status(400).json({ error: 'columnId + title required' });
    return;
  }
  const col = await prisma.column.findFirst({ where: { id: columnId, userId } });
  if (!col) {
    res.status(404).json({ error: 'column not found' });
    return;
  }
  let due: Date | null = null;
  try {
    due = parseDueDate(dueDate);
  } catch {
    res.status(400).json({ error: 'bad dueDate (use yyyy-mm-dd)' });
    return;
  }
  const key = cleanProjectKey(projectKey ?? '');
  if (key === null) {
    res.status(400).json({ error: 'bad projectKey (a-z0-9-_)' });
    return;
  }
  const isolate = gitEnabled === undefined ? false : gitEnabled === true;
  if (gitEnabled !== undefined && typeof gitEnabled !== 'boolean') {
    res.status(400).json({ error: 'bad gitEnabled' });
    return;
  }
  if (isolate && !key) {
    res.status(400).json({ error: 'projectKey required when gitEnabled' });
    return;
  }
  const count = await prisma.task.count({ where: { userId, columnId } });
  const created = await prisma.task.create({
    data: {
      userId,
      columnId,
      title: title.trim().slice(0, 200),
      description: typeof description === 'string' ? description.slice(0, 5000) : '',
      priority: validPriority(priority) ? priority : 'medium',
      dueDate: due,
      tags: cleanTags(tags),
      position: count,
      projectKey: key,
      gitEnabled: isolate,
    },
  });
  const titles = await columnTitles(userId);
  await record({
    userId,
    taskId: created.id,
    taskTitle: created.title,
    type: 'created',
    summary: `Created in ${titles.get(columnId) ?? 'a list'}`,
    toColumn: titles.get(columnId) ?? null,
  });
  res.status(201).json({ board: await getBoardState(userId) });
});

boardRouter.patch('/tasks/:id', async (req, res) => {
  const userId = uid(req);
  const task = await prisma.task.findFirst({ where: { id: req.params.id, userId } });
  if (!task) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  const {
    title,
    description,
    priority,
    dueDate,
    tags,
    archived,
    columnId,
    projectKey,
    agentState,
    gitEnabled,
    branch,
    lastCommit,
  } = req.body as {
    title?: unknown;
    description?: unknown;
    priority?: unknown;
    dueDate?: unknown;
    tags?: unknown;
    archived?: unknown;
    columnId?: unknown;
    projectKey?: unknown;
    agentState?: unknown;
    gitEnabled?: unknown;
    branch?: unknown;
    lastCommit?: unknown;
  };
  const data: {
    title?: string;
    description?: string;
    priority?: string;
    dueDate?: Date | null;
    tags?: string[];
    archived?: boolean;
    columnId?: string;
    position?: number;
    projectKey?: string;
    agentState?: string;
    gitEnabled?: boolean;
    branch?: string | null;
    lastCommit?: string | null;
  } = {};
  if (title !== undefined) {
    if (typeof title !== 'string' || !title.trim()) {
      res.status(400).json({ error: 'title cannot be empty' });
      return;
    }
    data.title = title.trim().slice(0, 200);
  }
  if (description !== undefined) {
    if (typeof description !== 'string') {
      res.status(400).json({ error: 'bad description' });
      return;
    }
    data.description = description.slice(0, 5000);
  }
  if (priority !== undefined) {
    if (!validPriority(priority)) {
      res.status(400).json({ error: 'bad priority' });
      return;
    }
    data.priority = priority;
  }
  if (dueDate !== undefined) {
    try {
      data.dueDate = parseDueDate(dueDate);
    } catch {
      res.status(400).json({ error: 'bad dueDate (use yyyy-mm-dd)' });
      return;
    }
  }
  if (tags !== undefined) data.tags = cleanTags(tags);
  if (projectKey !== undefined) {
    const key = cleanProjectKey(projectKey);
    if (key === null) {
      res.status(400).json({ error: 'bad projectKey (a-z0-9-_)' });
      return;
    }
    data.projectKey = key;
  }
  if (agentState !== undefined) {
    if (!validAgentState(agentState)) {
      res.status(400).json({ error: 'bad agentState' });
      return;
    }
    data.agentState = agentState;
  }
  if (gitEnabled !== undefined) {
    if (typeof gitEnabled !== 'boolean') {
      res.status(400).json({ error: 'bad gitEnabled' });
      return;
    }
    data.gitEnabled = gitEnabled;
  }
  if (branch !== undefined) {
    if (branch !== null && !validBranch(branch)) {
      res.status(400).json({ error: 'bad branch' });
      return;
    }
    data.branch = branch === null ? null : (branch as string).slice(0, 128);
  }
  if (lastCommit !== undefined) {
    if (lastCommit !== null && !validCommit(lastCommit)) {
      res.status(400).json({ error: 'bad lastCommit' });
      return;
    }
    data.lastCommit = lastCommit === null ? null : (lastCommit as string).slice(0, 40);
  }
  if (
    (data.gitEnabled === true || (data.gitEnabled === undefined && task.gitEnabled)) &&
    (data.projectKey !== undefined ? !data.projectKey : !task.projectKey)
  ) {
    res.status(400).json({ error: 'projectKey required when gitEnabled' });
    return;
  }
  if (archived !== undefined) {
    if (typeof archived !== 'boolean') {
      res.status(400).json({ error: 'bad archived' });
      return;
    }
    data.archived = archived;
  }
  if (columnId !== undefined) {
    if (typeof columnId !== 'string') {
      res.status(400).json({ error: 'bad columnId' });
      return;
    }
    const col = await prisma.column.findFirst({ where: { id: columnId, userId } });
    if (!col) {
      res.status(404).json({ error: 'column not found' });
      return;
    }
    if (columnId !== task.columnId) {
      const count = await prisma.task.count({ where: { userId, columnId } });
      data.columnId = columnId;
      data.position = count;
    }
  }
  await prisma.task.update({ where: { id: task.id }, data });

  // Journal: one entry describing exactly which fields actually changed.
  const changed: string[] = [];
  if (data.title !== undefined && data.title !== task.title) changed.push(FIELD_LABELS.title);
  if (data.description !== undefined && data.description !== task.description)
    changed.push(FIELD_LABELS.description);
  if (data.priority !== undefined && data.priority !== task.priority)
    changed.push(FIELD_LABELS.priority);
  if (data.dueDate !== undefined) {
    const before = toDateString(task.dueDate);
    const after = toDateString(data.dueDate);
    if (before !== after) changed.push(FIELD_LABELS.dueDate);
  }
  if (data.tags !== undefined && data.tags.join(',') !== task.tags.join(','))
    changed.push(FIELD_LABELS.tags);
  if (data.archived !== undefined && data.archived !== task.archived)
    changed.push(FIELD_LABELS.archived);
  if (data.projectKey !== undefined && data.projectKey !== task.projectKey)
    changed.push(FIELD_LABELS.projectKey);
  if (data.agentState !== undefined && data.agentState !== task.agentState)
    changed.push(FIELD_LABELS.agentState);
  if (data.gitEnabled !== undefined && data.gitEnabled !== task.gitEnabled)
    changed.push(FIELD_LABELS.gitEnabled);
  if (data.branch !== undefined && data.branch !== task.branch) changed.push(FIELD_LABELS.branch);
  if (data.lastCommit !== undefined && data.lastCommit !== task.lastCommit)
    changed.push(FIELD_LABELS.lastCommit);

  const titles = await columnTitles(userId);
  if (data.columnId) {
    await renumberColumn(userId, task.columnId);
    await record({
      userId,
      taskId: task.id,
      taskTitle: data.title ?? task.title,
      type: 'moved',
      summary: `Moved ${titles.get(task.columnId) ?? 'list'} → ${
        titles.get(data.columnId) ?? 'list'
      }`,
      fromColumn: titles.get(task.columnId) ?? null,
      toColumn: titles.get(data.columnId) ?? null,
    });
  }
  if (changed.length > 0) {
    await record({
      userId,
      taskId: task.id,
      taskTitle: data.title ?? task.title,
      type: data.archived === true ? 'archived' : data.archived === false ? 'unarchived' : 'updated',
      summary: `Updated ${changed.join(', ')}`,
    });
  }
  if (data.agentState !== undefined && data.agentState !== task.agentState) {
    const type =
      data.agentState === 'running'
        ? 'agent-started'
        : data.agentState === 'under-review'
          ? 'agent-review'
          : data.agentState === 'completed'
            ? 'agent-completed'
            : 'updated';
    await record({
      userId,
      taskId: task.id,
      taskTitle: data.title ?? task.title,
      type,
      summary:
        data.agentState === 'running'
          ? 'Agent started work'
          : data.agentState === 'under-review'
            ? 'Agent requested review'
            : data.agentState === 'completed'
              ? 'Marked completed after review'
              : `Agent state → ${data.agentState}`,
    });
  }
  if (data.lastCommit !== undefined && data.lastCommit && data.lastCommit !== task.lastCommit) {
    await record({
      userId,
      taskId: task.id,
      taskTitle: data.title ?? task.title,
      type: 'git-commit',
      summary: `Committed ${(data.lastCommit as string).slice(0, 7)}${data.branch ? ` on ${data.branch}` : ''}`,
      detail: data.lastCommit as string,
    });
  }
  bump(userId);
  res.json({ board: await getBoardState(userId) });
});

boardRouter.post('/tasks/:id/move', async (req, res) => {
  const userId = uid(req);
  const task = await prisma.task.findFirst({ where: { id: req.params.id, userId } });
  if (!task) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  const { columnId, position } = req.body as { columnId?: unknown; position?: unknown };
  if (typeof columnId !== 'string' || typeof position !== 'number') {
    res.status(400).json({ error: 'columnId + position required' });
    return;
  }
  const col = await prisma.column.findFirst({ where: { id: columnId, userId } });
  if (!col) {
    res.status(404).json({ error: 'column not found' });
    return;
  }
  const fromColumn = task.columnId;
  const inTarget = await prisma.task.findMany({
    where: { userId, columnId },
    orderBy: { position: 'asc' },
  });
  const without = inTarget.filter((t) => t.id !== task.id);
  const at = Math.max(0, Math.min(Math.floor(position), without.length));
  without.splice(at, 0, task);
  await prisma.$transaction(
    without.map((t, i) =>
      prisma.task.update({ where: { id: t.id }, data: { columnId, position: i } }),
    ),
  );
  if (fromColumn !== columnId) {
    await renumberColumn(userId, fromColumn);
    const titles = await columnTitles(userId);
    await record({
      userId,
      taskId: task.id,
      taskTitle: task.title,
      type: 'moved',
      summary: `Moved ${titles.get(fromColumn) ?? 'list'} → ${titles.get(columnId) ?? 'list'}`,
      fromColumn: titles.get(fromColumn) ?? null,
      toColumn: titles.get(columnId) ?? null,
    });
  }
  bump(userId);
  res.json({ board: await getBoardState(userId) });
});

boardRouter.delete('/tasks/:id', async (req, res) => {
  const userId = uid(req);
  const task = await prisma.task.findFirst({ where: { id: req.params.id, userId } });
  if (!task) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  await prisma.task.delete({ where: { id: task.id } });
  await renumberColumn(userId, task.columnId);
  const titles = await columnTitles(userId);
  await record({
    userId,
    taskId: task.id,
    taskTitle: task.title,
    type: 'deleted',
    summary: `Deleted from ${titles.get(task.columnId) ?? 'a list'}`,
    fromColumn: titles.get(task.columnId) ?? null,
  });
  bump(userId);
  res.json({ board: await getBoardState(userId) });
});

/** Shape accepted by import. Server-assigned fields (createdAt) are ignored. */
interface ParsedBoard {
  columns: { id: string; title: string }[];
  tasks: {
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
  }[];
}

/** Replace the entire board (used by JSON import). Client ids are preserved. */
boardRouter.post('/replace', async (req, res) => {
  const userId = uid(req);
  const { board, events } = req.body as { board?: unknown; events?: unknown };
  const parsed = parseBoardPayload(board);
  if (!parsed) {
    res.status(400).json({ error: 'bad board payload' });
    return;
  }
  const parsedEvents = parseEventPayload(events);
  await prisma.$transaction(async (tx) => {
    await tx.taskEvent.deleteMany({ where: { userId } });
    await tx.task.deleteMany({ where: { userId } });
    await tx.column.deleteMany({ where: { userId } });
    for (let i = 0; i < parsed.columns.length; i++) {
      const c = parsed.columns[i];
      await tx.column.create({
        data: { id: c.id, userId, title: c.title, position: i },
      });
    }
    const byCol = new Map<string, number>();
    for (const t of parsed.tasks) {
      const pos = byCol.get(t.columnId) ?? 0;
      byCol.set(t.columnId, pos + 1);
      await tx.task.create({
        data: {
          id: t.id,
          userId,
          columnId: t.columnId,
          title: t.title,
          description: t.description,
          priority: t.priority,
          dueDate: t.dueDate ? new Date(`${t.dueDate}T00:00:00.000Z`) : null,
          tags: t.tags,
          archived: t.archived,
          position: pos,
          projectKey: t.projectKey,
          agentState: t.agentState,
          gitEnabled: t.gitEnabled,
          branch: t.branch,
          lastCommit: t.lastCommit,
        },
      });
    }
    // Journal travels with the backup, oldest first, so ordering is preserved.
    for (const e of parsedEvents) {
      await tx.taskEvent.create({
        data: {
          userId,
          taskId: e.taskId,
          taskTitle: e.taskTitle,
          type: e.type,
          summary: e.summary,
          detail: e.detail,
          fromColumn: e.fromColumn,
          toColumn: e.toColumn,
          createdAt: e.createdAt,
        },
      });
    }
  });
  bump(userId);
  res.json({ board: await getBoardState(userId) });
});

interface ParsedEvent {
  taskId: string;
  taskTitle: string;
  type: string;
  summary: string;
  detail: string | null;
  fromColumn: string | null;
  toColumn: string | null;
  createdAt: Date;
}

function parseEventPayload(events: unknown): ParsedEvent[] {
  if (!Array.isArray(events)) return [];
  const out: ParsedEvent[] = [];
  for (const raw of events.slice(0, 20000)) {
    if (typeof raw !== 'object' || raw === null) continue;
    const e = raw as Record<string, unknown>;
    if (typeof e.taskId !== 'string' || typeof e.taskTitle !== 'string') continue;
    if (typeof e.summary !== 'string' || !e.summary.trim()) continue;
    if (!isEventType(e.type)) continue;
    const when = typeof e.createdAt === 'string' ? new Date(e.createdAt) : null;
    if (!when || Number.isNaN(when.getTime())) continue;
    out.push({
      taskId: e.taskId.slice(0, 60),
      taskTitle: e.taskTitle.slice(0, 200),
      type: e.type,
      summary: e.summary.trim().slice(0, 300),
      detail: typeof e.detail === 'string' ? e.detail.slice(0, 2000) : null,
      fromColumn: typeof e.fromColumn === 'string' ? e.fromColumn.slice(0, 60) : null,
      toColumn: typeof e.toColumn === 'string' ? e.toColumn.slice(0, 60) : null,
      createdAt: when,
    });
  }
  return out.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

function parseBoardPayload(board: unknown): ParsedBoard | null {
  if (typeof board !== 'object' || board === null) return null;
  const { columns, tasks } = board as { columns?: unknown; tasks?: unknown };
  if (!Array.isArray(columns) || !Array.isArray(tasks)) return null;
  if (columns.length === 0 || columns.length > 50) return null;
  if (tasks.length > 5000) return null;
  const colIds = new Set<string>();
  const cleanCols: ParsedBoard['columns'] = [];
  for (const c of columns) {
    if (typeof c !== 'object' || c === null) return null;
    const { id, title } = c as { id?: unknown; title?: unknown };
    if (typeof id !== 'string' || typeof title !== 'string' || !title.trim()) return null;
    if (colIds.has(id)) return null;
    colIds.add(id);
    cleanCols.push({ id: id.slice(0, 60), title: title.trim().slice(0, 60) });
  }
  const cleanTasks: ParsedBoard['tasks'] = [];
  const seen = new Set<string>();
  for (const t of tasks) {
    if (typeof t !== 'object' || t === null) return null;
    const r = t as Record<string, unknown>;
    if (
      typeof r.id !== 'string' ||
      typeof r.columnId !== 'string' ||
      typeof r.title !== 'string' ||
      !r.title.trim() ||
      !colIds.has(r.columnId) ||
      seen.has(r.id)
    ) {
      return null;
    }
    seen.add(r.id);
    let due: string | null = null;
    if (r.dueDate !== null && r.dueDate !== undefined && r.dueDate !== '') {
      if (typeof r.dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.dueDate)) return null;
      due = r.dueDate;
    }
    cleanTasks.push({
      id: r.id.slice(0, 60),
      columnId: r.columnId,
      title: r.title.trim().slice(0, 200),
      description: typeof r.description === 'string' ? r.description.slice(0, 5000) : '',
      priority: validPriority(r.priority) ? r.priority : 'medium',
      dueDate: due,
      tags: cleanTags(r.tags),
      archived: r.archived === true,
      projectKey: cleanProjectKey(r.projectKey ?? '') ?? '',
      agentState: validAgentState(r.agentState) ? r.agentState : 'idle',
      gitEnabled: r.gitEnabled === true,
      branch:
        typeof r.branch === 'string' && validBranch(r.branch) ? r.branch.slice(0, 128) : null,
      lastCommit:
        typeof r.lastCommit === 'string' && validCommit(r.lastCommit)
          ? r.lastCommit.slice(0, 40)
          : null,
    });
  }
  return { columns: cleanCols, tasks: cleanTasks };
}

/** Erase everything (columns + tasks + journal). */
boardRouter.delete('/', async (req, res) => {
  const userId = uid(req);
  await prisma.$transaction(async (tx) => {
    await tx.taskEvent.deleteMany({ where: { userId } });
    await tx.task.deleteMany({ where: { userId } });
    await tx.column.deleteMany({ where: { userId } });
  });
  bump(userId);
  res.json({ board: await getBoardState(userId) });
});

/** Clear + reseed demo data. */
boardRouter.post('/reset', async (req, res) => {
  const userId = uid(req);
  // One transaction for wipe + seed: two interactive transactions in a row
  // exhaust the pooled connection and fail with P2028.
  await prisma.$transaction(async (tx) => {
    await tx.taskEvent.deleteMany({ where: { userId } });
    await tx.task.deleteMany({ where: { userId } });
    await tx.column.deleteMany({ where: { userId } });
    await seedDefaults(userId, tx);
  });
  bump(userId);
  res.json({ board: await getBoardState(userId) });
});
