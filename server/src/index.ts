import express from 'express';
import 'express-async-errors';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { env } from './env';
import { prisma, warmDatabase } from './db';
import { authRouter } from './routes/auth';
import { boardRouter } from './routes/board';

const app = express();

// Behind Render/Railway/Fly proxies: needed for Secure cross-site cookies + correct proto.
app.set('trust proxy', 1);

app.use(cors({ origin: env.frontendOrigin, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

/**
 * Readiness probe: proves the API can reach Postgres.
 *
 * `/api/health` stays a cheap liveness answer for the host's own health check.
 * This one catches the failure mode that is otherwise invisible until the
 * first user query: a missing, wrong or unreachable DATABASE_URL.
 * The budget covers a cold Neon wake-up; the host's next probe is the retry.
 */
const DB_PROBE_TIMEOUT_MS = 5000;
app.get('/api/health/db', async (_req, res) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('db probe timed out')), DB_PROBE_TIMEOUT_MS);
        timer.unref();
      }),
    ]);
    res.json({ ok: true, db: 'up' });
  } catch {
    res.status(503).json({ ok: false, db: 'down' });
  } finally {
    clearTimeout(timer);
  }
});

app.use('/api/auth', authRouter);
app.use('/api/board', boardRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'not found' });
});

app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  },
);

app.listen(env.port, () => {
  console.log(`cardflow-server on :${env.port} (frontend: ${env.frontendOrigin})`);
  warmDatabase();
});
