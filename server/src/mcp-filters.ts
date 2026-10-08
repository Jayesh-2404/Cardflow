/**
 * Agent-facing rules for the MCP list tools. Deliberately free of Prisma and of
 * any env read at module scope, so every rule here is unit-testable without a
 * database or an auth token.
 *
 * Type-only imports are erased at compile time, so pulling in the board DTOs
 * does not drag `./db` (and its connection) along.
 */
import { z } from 'zod';
import type { BoardColumnDTO, BoardTaskDTO } from './board';

/** Due dates are stored and compared as plain yyyy-mm-dd in the owner's local day. */
export const DEFAULT_TZ = 'Asia/Kolkata';

const RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

/**
 * yyyy-mm-dd for `now` in `tz`.
 *
 * Not `toISOString().slice(0, 10)`: that is the UTC date, so between 00:00 and
 * 05:30 IST `list_today` would hand back yesterday's cards. Deploys run in UTC
 * (Render/Vercel), so this cannot rely on the host's local zone either.
 *
 * An unusable KANBAN_TZ falls back to the host's local date rather than
 * throwing — a slightly-off list beats a tool that refuses to answer.
 */
export function todayInTz(
  now: Date = new Date(),
  tz: string = process.env.KANBAN_TZ || DEFAULT_TZ,
): string {
  try {
    // formatToParts instead of locale ordering ('en-CA' does yield yyyy-mm-dd,
    // but building from the named parts does not depend on that staying true).
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const get = (type: 'year' | 'month' | 'day') =>
      parts.find((p) => p.type === type)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }
}

/** Lists are user-editable (add/rename/delete), so match the title loosely. */
export function isDoneTitle(title: string): boolean {
  return title.trim().toLowerCase() === 'done';
}

export function doneColumnIds(columns: BoardColumnDTO[]): Set<string> {
  return new Set(columns.filter((c) => isDoneTitle(c.title)).map((c) => c.id));
}

export interface SelectOptions {
  tasks: BoardTaskDTO[];
  columns: BoardColumnDTO[];
  /** yyyy-mm-dd */
  date: string;
  project?: string;
  limit?: number;
  /** Pass false for a tool that should still surface finished work. */
  excludeDone?: boolean;
}

/**
 * Open work for one day: not archived, due that day, and by default not parked
 * in a Done list — finished cards are not today's work. Highest priority first.
 */
export function selectOpenTasks({
  tasks,
  columns,
  date,
  project,
  limit = 20,
  excludeDone = true,
}: SelectOptions): BoardTaskDTO[] {
  const done = excludeDone ? doneColumnIds(columns) : new Set<string>();
  return tasks
    .filter(
      (t) =>
        !t.archived &&
        t.dueDate === date &&
        (!project || t.projectKey === project) &&
        !done.has(t.columnId),
    )
    .sort((a, b) => (RANK[a.priority] ?? 1) - (RANK[b.priority] ?? 1))
    .slice(0, limit);
}

export const DONE_ADVICE =
  "column must be 'Todo' or 'Doing'. Agents must never mark a card Done — move it to Doing and set agentState to 'under-review'; a human closes the card from the board.";

/**
 * Columns an agent may move a card to. 'Done' is absent on purpose: it should
 * not appear in the schema the model is shown, or the model will keep trying.
 * The errorMap is for the case where it tries anyway.
 */
export const agentColumn = z.enum(['Todo', 'Doing'], {
  errorMap: () => ({ message: DONE_ADVICE }),
});