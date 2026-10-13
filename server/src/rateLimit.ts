import type { NextFunction, Request, Response } from 'express';

interface Bucket {
  count: number;
  reset: number;
}

const buckets = new Map<string, Bucket>();

export function __resetRateLimit(): void {
  buckets.clear();
}

export function authLimiter(max: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const now = Date.now();
    const hit = buckets.get(ip);
    if (!hit || hit.reset <= now) {
      buckets.set(ip, { count: 1, reset: now + windowMs });
      next();
      return;
    }
    hit.count += 1;
    if (hit.count > max) {
      res.status(429).json({ error: 'too many attempts, try again later' });
      return;
    }
    next();
  };
}
