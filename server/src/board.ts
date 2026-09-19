import { prisma } from './db';
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
}

export interface BoardDTO {
  columns: BoardColumnDTO[];
  tasks: BoardTaskDTO[];
}

const PRIORITIES = new Set(['low', 'medium', 'high']);

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
    })),
  };
}

/** Default Todo/Doing/Done + welcome task. Used on register and board reset. */
export async function seedDefaults(userId: string): Promise<void> {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const todo = await tx.column.create({
      data: { userId, title: 'Todo', position: 0 },
    });
    await tx.column.create({ data: { userId, title: 'Doing', position: 1 } });
    await tx.column.create({ data: { userId, title: 'Done', position: 2 } });
    await tx.task.create({
      data: {
        userId,
        columnId: todo.id,
        title: 'Welcome — drag me to Doing',
        description: 'Press N for a new task, / to search.',
        priority: 'medium',
        tags: ['start'],
        position: 0,
        createdAt: now,
        updatedAt: now,
      },
    });
  });
}
