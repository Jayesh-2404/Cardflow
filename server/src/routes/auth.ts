import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../db';
import { clearAuthCookies, setAuthCookies } from '../cookies';
import { hashToken, signAccess, signRefresh, verifyRefresh } from '../tokens';
import { requireAuth, type AuthedRequest } from '../middleware';
import { validEmail, validPassword } from '../validate';
import { getBoardState, seedDefaults } from '../board';

export const authRouter = Router();

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Drop expired rows so the table tracks live devices rather than all history.
 *
 * Deliberately not awaited by callers: pruning is housekeeping and must never
 * add a round trip to a login. Best-effort, failure is ignored.
 */
function pruneSessions(userId: string): void {
  void prisma.session
    .deleteMany({ where: { userId, expiresAt: { lt: new Date() } } })
    .catch(() => {});
}

/** Issue a fresh access/refresh pair and record this device as its own session. */
async function startSession(userId: string): Promise<{ access: string; refresh: string }> {
  const access = signAccess(userId);
  const refresh = signRefresh(userId);
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(refresh),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    },
  });
  pruneSessions(userId);
  return { access, refresh };
}

/** First-run setup only: works while no user exists, then locks to 403. */
authRouter.post('/register', async (req, res) => {
  const { email, password } = req.body as { email?: unknown; password?: unknown };
  if (!validEmail(email) || !validPassword(password)) {
    res.status(400).json({ error: 'valid email + password (min 8 chars) required' });
    return;
  }
  const existing = await prisma.user.count();
  if (existing > 0) {
    res.status(403).json({ error: 'already set up — please log in' });
    return;
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email: email.trim().toLowerCase(), passwordHash },
  });
  await seedDefaults(user.id);
  const { access, refresh } = await startSession(user.id);
  setAuthCookies(res, access, refresh);
  res.status(201).json({ board: await getBoardState(user.id), user: { email: user.email } });
});

authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body as { email?: unknown; password?: unknown };
  if (typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'email + password required' });
    return;
  }
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
  });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    res.status(401).json({ error: 'wrong email or password' });
    return;
  }
  const { access, refresh } = await startSession(user.id);
  setAuthCookies(res, access, refresh);
  res.json({ board: await getBoardState(user.id), user: { email: user.email } });
});

/**
 * Rotate this device's session only.
 *
 * Looked up by token hash, so one browser's rotation leaves every other signed-in
 * device alone. Expired rows are rejected and removed, and the cookies are
 * cleared on failure so a dead cookie cannot be replayed on every retry.
 */
authRouter.post('/refresh', async (req, res) => {
  const cookies = req.cookies as Record<string, unknown> | undefined;
  const token = typeof cookies?.kb_rt === 'string' ? cookies.kb_rt : undefined;
  const userId = token ? verifyRefresh(token) : null;
  if (!userId) {
    clearAuthCookies(res);
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const session = token
    ? await prisma.session.findUnique({ where: { tokenHash: hashToken(token) } })
    : null;
  if (!session || session.userId !== userId || session.expiresAt.getTime() <= Date.now()) {
    if (session) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    }
    clearAuthCookies(res);
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const access = signAccess(userId);
  const refresh = signRefresh(userId);
  await prisma.$transaction([
    prisma.session.delete({ where: { id: session.id } }),
    prisma.session.create({
      data: {
        userId,
        tokenHash: hashToken(refresh),
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    }),
  ]);
  setAuthCookies(res, access, refresh);
  res.json({ ok: true });
});

authRouter.post('/logout', requireAuth, async (req, res) => {
  const { userId } = req as AuthedRequest;
  // Revoke only the calling device, so signing out here leaves other browsers
  // signed in.
  const cookies = req.cookies as Record<string, unknown> | undefined;
  const token = typeof cookies?.kb_rt === 'string' ? cookies.kb_rt : undefined;
  if (token) {
    await prisma.session
      .deleteMany({ where: { userId, tokenHash: hashToken(token) } })
      .catch(() => {});
  }
  clearAuthCookies(res);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const { userId } = req as AuthedRequest;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  res.json({ board: await getBoardState(user.id), user: { email: user.email } });
});

authRouter.post('/password', requireAuth, async (req, res) => {
  const { userId } = req as AuthedRequest;
  const { current, next } = req.body as { current?: unknown; next?: unknown };
  if (typeof current !== 'string' || !validPassword(next)) {
    res.status(400).json({ error: 'current password + new password (min 8 chars) required' });
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !(await bcrypt.compare(current, user.passwordHash))) {
    res.status(401).json({ error: 'current password wrong' });
    return;
  }
  const passwordHash = await bcrypt.hash(next, 12);
  // Password change is the deliberate "log out everywhere" event, unlike logout.
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    prisma.session.deleteMany({ where: { userId } }),
  ]);
  clearAuthCookies(res);
  res.json({ ok: true, relogin: true });
});
