const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PRIORITIES = new Set(['low', 'medium', 'high']);
const AGENT_STATES = new Set(['idle', 'running', 'under-review', 'completed']);
const PROJECT_KEY_RE = /^[a-z0-9][a-z0-9-_]{0,63}$/;
const BRANCH_RE = /^[A-Za-z0-9/_.-]{1,128}$/;
const COMMIT_RE = /^[0-9a-f]{7,40}$/i;

export function validEmail(v: unknown): v is string {
  return typeof v === 'string' && EMAIL_RE.test(v.trim()) && v.length <= 254;
}

export function validPassword(v: unknown): v is string {
  return typeof v === 'string' && v.length >= 8 && v.length <= 128;
}

export function validPriority(v: unknown): v is 'low' | 'medium' | 'high' {
  return typeof v === 'string' && PRIORITIES.has(v);
}

export function validAgentState(
  v: unknown,
): v is 'idle' | 'running' | 'under-review' | 'completed' {
  return typeof v === 'string' && AGENT_STATES.has(v);
}

export function cleanProjectKey(v: unknown): string | null {
  if (v === undefined || v === null || v === '') return '';
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  return PROJECT_KEY_RE.test(s) ? s : null;
}

export function validBranch(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  if (!BRANCH_RE.test(v)) return false;
  if (v.includes('..') || v.includes('@{') || v.includes('//') || v.endsWith('.lock')) return false;
  return true;
}

export function validCommit(v: unknown): v is string {
  return typeof v === 'string' && COMMIT_RE.test(v);
}

export function cleanTags(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((t): t is string => typeof t === 'string')
    .map((t) => t.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 24))
    .filter(Boolean)
    .filter((t, i, a) => a.indexOf(t) === i)
    .slice(0, 8);
}

/** Accepts "" | null | "yyyy-mm-dd". Returns Date (UTC midnight) or null. Throws on garbage. */
export function parseDueDate(v: unknown): Date | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error('bad dueDate');
  const d = new Date(`${v}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new Error('bad dueDate');
  return d;
}

export function toDateString(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}
