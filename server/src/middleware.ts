import type { NextFunction, Request, Response } from 'express';
import { verifyAccess } from './tokens';
import { env } from './env';
import { tokenMatches } from './mcp-auth';

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

/**
 * Auth for `/api/mcp/*`: one static bearer token, one fixed board owner.
 *
 * The MCP process is local and long-lived, so a 15-minute access JWT forced a
 * refresh dance that could fail mid-tool. A static token has no clock. The
 * user id lives in the server's env, not in the request, so a leaked token
 * cannot name a different owner.
 */
export function requireMcpAuth(req: Request, res: Response, next: NextFunction): void {
  if (!env.mcpToken || !env.mcpUserId) {
    res.status(503).json({
      error:
        'MCP auth is not configured: set KANBAN_MCP_TOKEN and KANBAN_MCP_USER_ID in server/.env',
    });
    return;
  }
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  if (!tokenMatches(token, env.mcpToken)) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  (req as AuthedRequest).userId = env.mcpUserId;
  next();
}
