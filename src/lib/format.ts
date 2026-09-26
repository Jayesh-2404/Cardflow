/** Date/time helpers shared by cards, the editor and the journal timeline. */

const DAY_MS = 86_400_000;

/** Today as `yyyy-mm-dd` in the viewer's local timezone. */
export function todayISO(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Whole days from today to `iso` (negative = in the past). */
export function daysUntil(iso: string, now: Date = new Date()): number {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return 0;
  const target = new Date(y, m - 1, d).getTime();
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((target - base) / DAY_MS);
}

export type DueTone = 'none' | 'overdue' | 'today' | 'soon' | 'later';

export interface DueMeta {
  label: string;
  tone: DueTone;
  title: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Human due date: `Today`, `Tomorrow`, `3d overdue`, `Sep 26`. */
export function dueMeta(iso: string | null, now: Date = new Date()): DueMeta {
  if (!iso) return { label: '', tone: 'none', title: 'No due date' };
  const delta = daysUntil(iso, now);
  const [y, m, d] = iso.split('-').map(Number);
  const long = `${MONTHS[(m ?? 1) - 1]} ${d}, ${y}`;
  if (delta < 0) {
    const n = Math.abs(delta);
    return { label: `${n}d late`, tone: 'overdue', title: `Due ${long} — ${n} day${n > 1 ? 's' : ''} late` };
  }
  if (delta === 0) return { label: 'Today', tone: 'today', title: `Due today — ${long}` };
  if (delta === 1) return { label: 'Tomorrow', tone: 'soon', title: `Due tomorrow — ${long}` };
  if (delta <= 7) return { label: `${delta}d`, tone: 'soon', title: `Due in ${delta} days — ${long}` };
  return { label: `${MONTHS[(m ?? 1) - 1]} ${d}`, tone: 'later', title: `Due ${long}` };
}

/* ---------------------------------------------------------------- journal */

const MIN_MS = 60_000;
const HOUR_MS = 3_600_000;

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Compact age used on every timeline row: `now`, `12m`, `5h`, `3d`, `Sep 14`. */
export function relTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = now.getTime() - then;
  if (diff < MIN_MS) return 'now';
  if (diff < HOUR_MS) return `${Math.floor(diff / MIN_MS)}m`;
  if (diff < DAY_MS) return `${Math.floor(diff / HOUR_MS)}h`;
  const days = Math.round((startOfDay(now) - startOfDay(new Date(then))) / DAY_MS);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d`;
  const d = new Date(then);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** `Today` / `Yesterday` / `Mon, Sep 22` — the sticky header in the feed. */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diff = Math.round((startOfDay(now) - startOfDay(d)) / DAY_MS);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) {
    return d.toLocaleDateString(undefined, { weekday: 'long' });
  }
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Full timestamp for the `title` tooltip, e.g. `Fri, Sep 26 · 18:04`. */
export function absTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })} · ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
}
