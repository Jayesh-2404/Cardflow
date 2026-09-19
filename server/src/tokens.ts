import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from './env';

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function newRefreshId(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function signAccess(userId: string): string {
  return jwt.sign({ sub: userId }, env.jwtSecret, { expiresIn: '15m' });
}

export function signRefresh(userId: string): string {
  return jwt.sign({ sub: userId, typ: 'refresh' }, env.jwtSecret, { expiresIn: '30d' });
}

export function verifyAccess(token: string): string | null {
  try {
    const p = jwt.verify(token, env.jwtSecret) as { sub?: unknown; typ?: unknown };
    if (typeof p.sub !== 'string' || p.typ !== undefined) return null;
    return p.sub;
  } catch {
    return null;
  }
}

export function verifyRefresh(token: string): string | null {
  try {
    const p = jwt.verify(token, env.jwtSecret) as { sub?: unknown; typ?: unknown };
    if (typeof p.sub !== 'string' || p.typ !== 'refresh') return null;
    return p.sub;
  } catch {
    return null;
  }
}
