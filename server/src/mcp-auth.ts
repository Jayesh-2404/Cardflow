import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Constant-time string compare for the MCP bearer token.
 *
 * Hashing both sides first means `timingSafeEqual` never sees different
 * lengths (it throws on those) and the comparison time does not reveal how
 * many leading characters matched.
 *
 * Pure and dependency-free so it unit-tests without env or a database.
 */
export function tokenMatches(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}
