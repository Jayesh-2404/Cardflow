import { Router } from 'express';
import { prisma } from '../db';
import { requireMcpAuth, type AuthedRequest } from '../middleware';
import { clientCount, versionFor } from '../realtime';

export const mcpRouter = Router();
mcpRouter.use(requireMcpAuth);

/**
 * One call that answers "why is the agent stuck?".
 *
 * The MCP renders the local half (project roots, token presence) next to this
 * remote half, so a failing run can be diagnosed without reading server logs:
 * is the API up, can it see Postgres, does the configured owner exist, is the
 * board empty, and is a live browser listening for SSE pushes.
 */
mcpRouter.get('/health', async (req, res) => {
  const userId = (req as AuthedRequest).userId;
  const started = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    res.status(503).json({
      ok: false,
      api: 'up',
      db: 'down',
      latencyMs: Date.now() - started,
      hint: 'The API cannot reach Postgres. Check DATABASE_URL and Neon, then GET /api/health/db.',
    });
    return;
  }

  const [user, columns, tasks, open, events] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true } }),
    prisma.column.count({ where: { userId } }),
    prisma.task.count({ where: { userId } }),
    prisma.task.count({ where: { userId, archived: false } }),
    prisma.taskEvent.count({ where: { userId } }),
  ]);

  res.json({
    ok: Boolean(user),
    api: 'up',
    db: 'up',
    latencyMs: Date.now() - started,
    user: { found: Boolean(user) },
    board: {
      columns,
      tasks,
      open,
      events,
      sseClients: clientCount(userId),
      version: versionFor(userId),
    },
    mcp: {
      // The token is checked by this middleware, so reaching here means it
      // matched. The owner id is what a missing user row would break.
      auth: 'ok',
      userIdConfigured: Boolean(process.env.KANBAN_MCP_USER_ID),
    },
  });
});
