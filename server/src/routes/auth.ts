import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../db';
import { clearAuthCookies, setAuthCookies } from '../cookies';
import { hashToken, signAccess, signRefresh, verifyRefresh } from '../tokens';
import { requireAuth, type AuthedRequest } from '../middleware';
import { validEmail, validPassword } from '../validate';
import { getBoardState, seedDefaults } from '../board';

export const authRouter = Router();

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
  const access = signAccess(user.id);
  const refresh = signRefresh(user.id);
  await prisma.user.update({
    where: { id: user.id },
    data: { refreshTokenHash: hashToken(refresh) },
  });
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
  const access = signAccess(user.id);
  const refresh = signRefresh(user.id);
  await prisma.user.update({
    where: { id: user.id },
    data: { refreshTokenHash: hashToken(refresh) },
  });
  setAuthCookies(res, access, refresh);
  res.json({ board: await getBoardState(user.id), user: { email: user.email } });
});

authRouter.post('/refresh', async (req, res) => {
  const cookies = req.cookies as Record<string, unknown> | undefined;
  const token = typeof cookies?.kb_rt === 'string' ? cookies.kb_rt : undefined;
  const userId = token ? verifyRefresh(token) : null;
  if (!userId) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.refreshTokenHash || user.refreshTokenHash !== hashToken(token as string)) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const access = signAccess(user.id);
  const refresh = signRefresh(user.id);
  await prisma.user.update({
    where: { id: user.id },
    data: { refreshTokenHash: hashToken(refresh) },
  });
  setAuthCookies(res, access, refresh);
  res.json({ ok: true });
});

authRouter.post('/logout', requireAuth, async (req, res) => {
  const { userId } = req as AuthedRequest;
  await prisma.user.update({ where: { id: userId }, data: { refreshTokenHash: null } });
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
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(next, 12), refreshTokenHash: null },
  });
  clearAuthCookies(res);
  res.json({ ok: true, relogin: true });
});
