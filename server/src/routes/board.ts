import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth, type AuthedRequest } from '../middleware';
import { cleanTags, parseDueDate, validPriority } from '../validate';
import { getBoardState, seedDefaults } from '../board';
import type { BoardDTO } from '../board';

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

boardRouter.get('/', async (req, res) => {
  res.json({ board: await getBoardState(uid(req)) });
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
  res.json({ board: await getBoardState(userId) });
});

boardRouter.post('/tasks', async (req, res) => {
  const userId = uid(req);
  const { columnId, title, description, priority, dueDate, tags } = req.body as {
    columnId?: unknown;
    title?: unknown;
    description?: unknown;
    priority?: unknown;
    dueDate?: unknown;
    tags?: unknown;
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
  const count = await prisma.task.count({ where: { userId, columnId } });
  await prisma.task.create({
    data: {
      userId,
      columnId,
      title: title.trim().slice(0, 200),
      description: typeof description === 'string' ? description.slice(0, 5000) : '',
      priority: validPriority(priority) ? priority : 'medium',
      dueDate: due,
      tags: cleanTags(tags),
      position: count,
    },
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
  const { title, description, priority, dueDate, tags, archived, columnId } = req.body as {
    title?: unknown;
    description?: unknown;
    priority?: unknown;
    dueDate?: unknown;
    tags?: unknown;
    archived?: unknown;
    columnId?: unknown;
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
  if (data.columnId) await renumberColumn(userId, task.columnId);
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
  if (fromColumn !== columnId) await renumberColumn(userId, fromColumn);
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
  res.json({ board: await getBoardState(userId) });
});

/** Replace the entire board (used by JSON import). Client ids are preserved. */
boardRouter.post('/replace', async (req, res) => {
  const userId = uid(req);
  const { board } = req.body as { board?: unknown };
  const parsed = parseBoardPayload(board);
  if (!parsed) {
    res.status(400).json({ error: 'bad board payload' });
    return;
  }
  await prisma.$transaction(async (tx) => {
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
        },
      });
    }
  });
  res.json({ board: await getBoardState(userId) });
});

function parseBoardPayload(board: unknown): BoardDTO | null {
  if (typeof board !== 'object' || board === null) return null;
  const { columns, tasks } = board as { columns?: unknown; tasks?: unknown };
  if (!Array.isArray(columns) || !Array.isArray(tasks)) return null;
  if (columns.length === 0 || columns.length > 50) return null;
  if (tasks.length > 5000) return null;
  const colIds = new Set<string>();
  const cleanCols: BoardDTO['columns'] = [];
  for (const c of columns) {
    if (typeof c !== 'object' || c === null) return null;
    const { id, title } = c as { id?: unknown; title?: unknown };
    if (typeof id !== 'string' || typeof title !== 'string' || !title.trim()) return null;
    if (colIds.has(id)) return null;
    colIds.add(id);
    cleanCols.push({ id: id.slice(0, 60), title: title.trim().slice(0, 60) });
  }
  const cleanTasks: BoardDTO['tasks'] = [];
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
    });
  }
  return { columns: cleanCols, tasks: cleanTasks };
}

/** Erase everything (columns + tasks). */
boardRouter.delete('/', async (req, res) => {
  const userId = uid(req);
  await prisma.$transaction(async (tx) => {
    await tx.task.deleteMany({ where: { userId } });
    await tx.column.deleteMany({ where: { userId } });
  });
  res.json({ board: await getBoardState(userId) });
});

/** Clear + reseed demo data. */
boardRouter.post('/reset', async (req, res) => {
  const userId = uid(req);
  await prisma.$transaction(async (tx) => {
    await tx.task.deleteMany({ where: { userId } });
    await tx.column.deleteMany({ where: { userId } });
  });
  await seedDefaults(userId);
  res.json({ board: await getBoardState(userId) });
});
