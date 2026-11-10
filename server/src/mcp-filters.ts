/**
 * Agent-facing rules for the MCP list tools. Deliberately free of Prisma and of
 * any env read at module scope, so every rule here is unit-testable without a
 * database or an auth token.
 *
 * Type-only imports are erased at compile time, so pulling in the board DTOs
 * does not drag `./db` (and its connection) along.
 */
import type { BoardColumnDTO, BoardTaskDTO } from './board';

/** Due dates are stored and compared as plain yyyy-mm-dd in the owner's local day. */
export const DEFAULT_TZ = 'Asia/Kolkata';

export const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

/** `kanban/<id tail>-<title slug>`, short enough for every git host. */
export function branchFor(task: { id: string; title: string }): string {
  const slug =
    task.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'task';
  return `kanban/${task.id.slice(-6)}-${slug}`;
}

/** Compact human duration for journal summaries and the agent badge. */
export function runDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return `${Math.max(1, Math.round(ms / 1000))}s`;
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`;
}

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

/**
 * Ids of lists with the `done` kind. The title is user-editable, so matching it
 * would let a renamed Done list leak finished cards back into an agent queue.
 */
export function doneColumnIds(columns: BoardColumnDTO[]): Set<string> {
  return new Set(columns.filter((c) => c.kind === 'done').map((c) => c.id));
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
    .sort((a, b) => (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1))
    .slice(0, limit);
}

/** Dates are yyyy-mm-dd; an undated card is the least urgent tiebreak. */
function dueRank(dueDate: string | null): number {
  if (!dueDate) return Number.MAX_SAFE_INTEGER;
  const t = Date.parse(`${dueDate}T00:00:00.000Z`);
  return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
}

/**
 * The picker behind `pick_task`: unclaimed cards in Todo, in the order an agent
 * should take them. Priority wins, then the due date (overdue first, undated
 * last). The board query already ordered by position, and JS sort is stable, so
 * cards that tie keep the user's manual order.
 *
 * `agentState` is derived from the latest run, so an idle card is one no other
 * agent currently holds.
 */
export function rankOpenTasks(
  tasks: BoardTaskDTO[],
  columns: BoardColumnDTO[],
): BoardTaskDTO[] {
  const todo = new Set(columns.filter((c) => c.kind === 'todo').map((c) => c.id));
  return tasks
    .filter((t) => !t.archived && t.agentState === 'idle' && todo.has(t.columnId))
    .sort(
      (a, b) =>
        (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1) ||
        dueRank(a.dueDate) - dueRank(b.dueDate),
    );
}