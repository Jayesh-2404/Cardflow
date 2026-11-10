/**
 * The four lists a board can have. The `kind` is what code reasons about; the
 * title is what the user sees and may rename. Keeping them apart means a list
 * renamed to "Shipped" is still the Done list, and an agent cannot escape the
 * Done rule by picking a different title.
 *
 * Pure and dependency-free so the API, the MCP rules and the tests can all use
 * it without a database or an env var.
 */

export type ColumnKind = 'todo' | 'active' | 'review' | 'done';

/** Board order for a freshly seeded board. Position can still be reordered. */
export const COLUMN_KINDS: readonly ColumnKind[] = ['todo', 'active', 'review', 'done'];

export const COLUMN_TITLES: Record<ColumnKind, string> = {
  todo: 'Todo',
  active: 'Doing',
  review: 'Under Review',
  done: 'Done',
};

const KIND_SET = new Set<string>(COLUMN_KINDS);

export function isColumnKind(value: unknown): value is ColumnKind {
  return typeof value === 'string' && KIND_SET.has(value);
}

/**
 * Loose title -> kind, for imports written before `kind` existed. Anything
 * unrecognised becomes active rather than guessing a terminal state.
 *
 * Mirrors the classification in the four-lists migration so an old backup and
 * an old database land in the same place.
 */
export function kindFromTitle(title: string): ColumnKind {
  const t = title.trim().toLowerCase();
  if (t === 'todo' || t === 'to do' || t === 'backlog') return 'todo';
  if (t === 'doing' || t === 'in progress' || t === 'in-progress' || t === 'active') return 'active';
  if (t === 'under review' || t === 'review' || t === 'in review' || t === 'in-review') {
    return 'review';
  }
  if (t === 'done' || t === 'complete' || t === 'completed' || t.startsWith('done ')) return 'done';
  return 'active';
}

/**
 * What the card badge and the agent filter should say.
 *
 * The column is the coarse truth; a live run is the specific one. Done wins
 * over everything, because a human closing the card is final even if an old
 * run row was never finished.
 */
export type AgentState = 'idle' | 'running' | 'under-review' | 'completed';

export function deriveAgentState(
  kind: ColumnKind,
  latestRunStatus?: string | null,
): AgentState {
  if (kind === 'done') return 'completed';
  if (latestRunStatus === 'claimed' || latestRunStatus === 'running') return 'running';
  if (kind === 'review' || latestRunStatus === 'review') return 'under-review';
  return 'idle';
}
