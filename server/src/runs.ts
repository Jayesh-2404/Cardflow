import { Prisma } from '@prisma/client';
import { prisma } from './db';
import { getBoardState, renumberColumn, toRunDTO, type BoardDTO, type BoardRunDTO } from './board';
import { branchFor, rankOpenTasks, runDuration } from './mcp-filters';
import { record } from './journal';
import { bump } from './realtime';
import { validBranch, validCommit, validPrUrl } from './validate';

export interface ClaimInput {
  runner: string;
  model?: string | null;
  /** Project keys this machine can actually open. Empty means any card. */
  projects?: string[];
}

export interface ClaimResult {
  board: BoardDTO;
  run: BoardRunDTO;
  branch: string;
  taskId: string;
}

export interface FinishInput {
  id: string;
  branch?: string | null;
  lastCommit?: string | null;
  prUrl?: string | null;
  prNumber?: number | null;
  summary?: string | null;
}

const TX = { timeout: 20_000, maxWait: 5_000 };

function isActiveRunConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

async function activeRun(userId: string, taskId: string) {
  return prisma.taskRun.findFirst({
    where: { userId, taskId, status: { in: ['claimed', 'running'] } },
    orderBy: { startedAt: 'desc' },
  });
}

/**
 * Claim the next card and move it to Doing in one transaction. A partial unique
 * index on TaskRun(taskId) for claimed/running rows turns a second concurrent
 * claim into P2002, so this retries the next card instead of double-booking.
 */
export async function claimNextTask(
  userId: string,
  input: ClaimInput,
): Promise<ClaimResult | null> {
  const board = await getBoardState(userId);
  const doing = board.columns.find((c) => c.kind === 'active');
  if (!doing) throw new Error('the board has no Doing list');

  const allowed = input.projects && input.projects.length > 0 ? new Set(input.projects) : null;
  const candidates = rankOpenTasks(board.tasks, board.columns).filter(
    (t) => !allowed || allowed.has(t.projectKey),
  );

  for (const task of candidates) {
    const branch = branchFor(task);
    const now = new Date();
    try {
      const run = await prisma.$transaction(async (tx) => {
        const created = await tx.taskRun.create({
          data: {
            userId,
            taskId: task.id,
            status: 'running',
            runner: input.runner,
            model: input.model ?? null,
            branch,
            startedAt: now,
            heartbeatAt: now,
          },
        });
        const position = await tx.task.count({ where: { userId, columnId: doing.id } });
        await tx.task.update({
          where: { id: task.id },
          data: { columnId: doing.id, position },
        });
        return created;
      }, TX);

      await renumberColumn(userId, task.columnId);
      await record({
        userId,
        taskId: task.id,
        taskTitle: task.title,
        type: 'agent-started',
        summary: `${input.runner} started work${input.model ? ` · ${input.model}` : ''}`,
        detail: `Branch ${branch}`,
      });
      bump(userId);

      const next = await getBoardState(userId);
      return {
        board: next,
        run: toRunDTO(run),
        branch,
        taskId: task.id,
      };
    } catch (error) {
      if (isActiveRunConflict(error)) continue;
      throw error;
    }
  }
  return null;
}

/** Keeps a long run visible as alive without writing a journal row per beat. */
export async function heartbeatRun(
  userId: string,
  taskId: string,
): Promise<{ heartbeatAt: string }> {
  const run = await activeRun(userId, taskId);
  if (!run) throw new Error('no active run for that card');
  const now = new Date();
  await prisma.taskRun.update({ where: { id: run.id }, data: { heartbeatAt: now } });
  return { heartbeatAt: now.toISOString() };
}

/**
 * End a run in Under Review. The branch and PR are optional so a run that could
 * not push still lands in review with a truthful note instead of disappearing.
 */
export async function finishRun(userId: string, input: FinishInput): Promise<BoardDTO> {
  const task = await prisma.task.findFirst({ where: { id: input.id, userId } });
  if (!task) throw new Error('not found');
  const run = await activeRun(userId, task.id);
  if (!run) throw new Error('that card has no active run; call pick_task first');

  if (input.branch !== undefined && input.branch !== null && !validBranch(input.branch)) {
    throw new Error('bad branch');
  }
  if (input.lastCommit !== undefined && input.lastCommit !== null && !validCommit(input.lastCommit)) {
    throw new Error('bad lastCommit');
  }
  if (input.prUrl !== undefined && input.prUrl !== null && !validPrUrl(input.prUrl)) {
    throw new Error('bad prUrl');
  }
  if (
    input.prNumber !== undefined &&
    input.prNumber !== null &&
    typeof input.prNumber !== 'number'
  ) {
    throw new Error('bad prNumber');
  }
  if (input.summary !== undefined && input.summary !== null && typeof input.summary !== 'string') {
    throw new Error('bad summary');
  }
  const prNumber =
    input.prNumber === undefined || input.prNumber === null ? null : Math.floor(input.prNumber);
  if (prNumber !== null && (prNumber < 1 || prNumber > 999_999_999)) {
    throw new Error('bad prNumber');
  }

  const review = await prisma.column.findFirst({ where: { userId, kind: 'review' } });
  if (!review) throw new Error('the board has no Under Review list');

  const now = new Date();
  const elapsedMs = Math.max(0, now.getTime() - run.startedAt.getTime());
  const branch = input.branch ?? run.branch ?? task.branch;
  await prisma.$transaction(async (tx) => {
    await tx.taskRun.update({
      where: { id: run.id },
      data: {
        status: 'review',
        finishedAt: now,
        elapsedMs,
        branch,
        prUrl: input.prUrl ?? null,
        prNumber,
        error: null,
      },
    });
    const position = await tx.task.count({ where: { userId, columnId: review.id } });
    await tx.task.update({
      where: { id: task.id },
      data: {
        columnId: review.id,
        position,
        branch,
        lastCommit: input.lastCommit ?? task.lastCommit,
      },
    });
  }, TX);

  await renumberColumn(userId, task.columnId);
  await record({
    userId,
    taskId: task.id,
    taskTitle: task.title,
    type: 'agent-review',
    summary: `${run.runner} requested review · ${runDuration(elapsedMs)}`,
    detail: [
      run.model ? `Model ${run.model}` : null,
      branch ? `Branch ${branch}` : null,
      input.prUrl ? `PR ${input.prUrl}` : null,
      input.summary?.trim() ? input.summary.trim().slice(0, 1500) : null,
    ]
      .filter(Boolean)
      .join('\n') || null,
  });
  bump(userId);
  return getBoardState(userId);
}

/** Give the card back to Todo when the run cannot continue. */
export async function releaseRun(
  userId: string,
  taskId: string,
  reason?: string | null,
): Promise<BoardDTO> {
  const task = await prisma.task.findFirst({ where: { id: taskId, userId } });
  if (!task) throw new Error('not found');
  const run = await activeRun(userId, taskId);
  const todo = await prisma.column.findFirst({ where: { userId, kind: 'todo' } });
  if (!todo) throw new Error('the board has no Todo list');
  if (!run) throw new Error('that card has no active run');

  const now = new Date();
  const elapsedMs = Math.max(0, now.getTime() - run.startedAt.getTime());
  await prisma.$transaction(async (tx) => {
    await tx.taskRun.update({
      where: { id: run.id },
      data: {
        status: 'abandoned',
        finishedAt: now,
        elapsedMs,
        error: reason?.trim().slice(0, 1000) || null,
      },
    });
    const position = await tx.task.count({ where: { userId, columnId: todo.id } });
    await tx.task.update({ where: { id: task.id }, data: { columnId: todo.id, position } });
  }, TX);

  await renumberColumn(userId, task.columnId);
  await record({
    userId,
    taskId: task.id,
    taskTitle: task.title,
    type: 'updated',
    summary: `${run.runner} released the card${reason?.trim() ? `: ${reason.trim().slice(0, 200)}` : ''}`,
  });
  bump(userId);
  return getBoardState(userId);
}

/**
 * A human closing a card ends whatever attempt was on it. Called from the board
 * move/patch paths; never from the MCP, which cannot reach Done.
 */
export async function completeRunForTask(userId: string, taskId: string): Promise<void> {
  const run = await prisma.taskRun.findFirst({
    where: { userId, taskId, status: { in: ['claimed', 'running', 'review'] } },
    orderBy: { startedAt: 'desc' },
  });
  if (!run) return;
  const now = new Date();
  await prisma.taskRun.update({
    where: { id: run.id },
    data: {
      status: 'completed',
      finishedAt: run.finishedAt ?? now,
      elapsedMs: run.elapsedMs ?? Math.max(0, now.getTime() - run.startedAt.getTime()),
    },
  });
}
