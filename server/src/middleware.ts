import type { NextFunction, Request, Response } from 'express';
import { verifyAccess } from './tokens';

export interface AuthedRequest extends Request {
  userId: string;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const cookies = req.cookies as Record<string, unknown> | undefined;
  const token = typeof cookies?.kb_at === 'string' ? cookies.kb_at : undefined;
  const userId = token ? verifyAccess(token) : null;
  if (!userId) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  (req as AuthedRequest).userId = userId;
  next();
}
