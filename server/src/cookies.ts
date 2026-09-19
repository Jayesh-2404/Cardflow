import type { Response } from 'express';
import { isProd } from './env';

const base = {
  httpOnly: true,
  sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
  secure: isProd,
  path: '/',
};

export function setAuthCookies(res: Response, access: string, refresh: string): void {
  res.cookie('kb_at', access, { ...base, maxAge: 15 * 60 * 1000 });
  res.cookie('kb_rt', refresh, { ...base, maxAge: 30 * 24 * 60 * 60 * 1000 });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie('kb_at', { ...base });
  res.clearCookie('kb_rt', { ...base });
}
