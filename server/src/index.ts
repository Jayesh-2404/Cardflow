import express from 'express';
import 'express-async-errors';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { env } from './env';
import { warmDatabase } from './db';
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
  console.log(`kanban-server on :${env.port} (frontend: ${env.frontendOrigin})`);
  warmDatabase();
});
