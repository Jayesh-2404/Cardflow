const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PRIORITIES = new Set(['low', 'medium', 'high']);

export function validEmail(v: unknown): v is string {
  return typeof v === 'string' && EMAIL_RE.test(v.trim()) && v.length <= 254;
}

export function validPassword(v: unknown): v is string {
  return typeof v === 'string' && v.length >= 8 && v.length <= 128;
}

export function validPriority(v: unknown): v is 'low' | 'medium' | 'high' {
  return typeof v === 'string' && PRIORITIES.has(v);
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
