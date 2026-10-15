/**
 * Deploy-readiness checks for the server's environment.
 *
 * Dependency-free and pure so it unit-tests without a database or network, and
 * so one implementation serves both callers:
 *
 *  - `src/env.ts` runs the rules at boot (`prod` set from NODE_ENV), which is
 *    what actually blocks a broken deploy on the host.
 *  - `scripts/preflight.ts` runs the same rules as a CLI gate
 *    (`npm run preflight`) so the problems are visible before deploying.
 */

export interface EnvCheckIssue {
  level: 'error' | 'warning';
  /** What is wrong, in one sentence. */
  message: string;
  /** How to fix it. */
  hint?: string;
}

export interface EnvCheckOptions {
  /**
   * Production rules: NODE_ENV=production, a real https FRONTEND_ORIGIN.
   * Dev passes false so a local `npm run preflight` can sanity-check the
   * basics without pretending localhost is a deploy target.
   */
  prod: boolean;
}

const NEON_HINT =
  'Neon dashboard -> Connection Details -> Pooled connection string (its host contains "-pooler")';
const JWT_HINT = 'Generate one with: openssl rand -base64 32';

export function checkDeployEnv(
  env: Record<string, string | undefined>,
  opts: EnvCheckOptions,
): EnvCheckIssue[] {
  const issues: EnvCheckIssue[] = [];
  const err = (message: string, hint?: string) => issues.push({ level: 'error', message, hint });
  const warn = (message: string, hint?: string) => issues.push({ level: 'warning', message, hint });

  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    err('DATABASE_URL is not set.', `Use the Neon pooled URL. ${NEON_HINT}.`);
  } else if (!/^postgres(ql)?:\/\//.test(databaseUrl)) {
    err('DATABASE_URL does not look like a Postgres URL.', `Expected postgresql://... ${NEON_HINT}.`);
  } else if (!/sslmode=/.test(databaseUrl)) {
    warn('DATABASE_URL has no sslmode parameter.', 'Neon requires TLS; append ?sslmode=require.');
  }

  const directUrl = env.DIRECT_URL?.trim();
  if (!directUrl) {
    err(
      'DIRECT_URL is not set.',
      'Prisma resolves migrations through directUrl, and a pooled connection cannot run their DDL. Use the Neon direct (non-pooled) URL.',
    );
  } else {
    if (/-pooler/.test(directUrl)) {
      warn(
        'DIRECT_URL looks pooled (its host contains "-pooler").',
        'Migrations need the direct URL; they fail or hang against the pooler.',
      );
    }
    if (databaseUrl && directUrl === databaseUrl) {
      warn(
        'DATABASE_URL and DIRECT_URL are identical.',
        'Neon runtime wants the pooled URL and migrations want the direct one; on a non-pooled host they may legitimately match.',
      );
    }
  }

  const jwtSecret = env.JWT_SECRET;
  if (!jwtSecret) {
    err('JWT_SECRET is not set.', JWT_HINT);
  } else if (jwtSecret.length < 32) {
    err(`JWT_SECRET is only ${jwtSecret.length} characters; 32 is the minimum.`, JWT_HINT);
  } else if (/change[-\s_]?me|placeholder|your[-\s_]?secret/i.test(jwtSecret)) {
    err('JWT_SECRET still contains placeholder text.', JWT_HINT);
  }

  const port = env.PORT?.trim();
  if (port) {
    const n = Number(port);
    if (!Number.isInteger(n) || n < 1 || n > 65535) {
      err(`PORT is not a valid port number ("${port}").`, 'Leave PORT unset unless the host requires it.');
    }
  }

  if (opts.prod) {
    if (env.NODE_ENV !== 'production') {
      err(
        `NODE_ENV is ${env.NODE_ENV ? `"${env.NODE_ENV}"` : 'unset'}; the API host must run NODE_ENV=production.`,
        'Auth cookies only switch to SameSite=None; Secure in production, so cross-origin logins break without it.',
      );
    }

    const origin = env.FRONTEND_ORIGIN?.trim();
    if (!origin) {
      err(
        'FRONTEND_ORIGIN is not set in production.',
        'It must be the exact URL of the deployed web app (scheme + host, no trailing slash). Without it the API falls back to http://localhost:5173 for CORS and cookies, and the browser blocks every call while curl still looks healthy.',
      );
    } else if (!/^https?:\/\/[^/\s]+$/.test(origin)) {
      err(
        `FRONTEND_ORIGIN "${origin}" is not a bare origin.`,
        'Use scheme + host only, no path and no trailing slash, e.g. https://your-board.vercel.app.',
      );
    } else {
      if (/^http:\/\//i.test(origin)) {
        err(
          'FRONTEND_ORIGIN must be https in production.',
          'Cross-site cookies are Secure; browsers refuse to send them to an http origin.',
        );
      }
      if (/^(https?):\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
        err(
          'FRONTEND_ORIGIN points at localhost in production.',
          'Set the URL you actually open the deployed board at.',
        );
      }
    }
  }

  return issues;
}
