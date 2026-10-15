import 'dotenv/config';
import { checkDeployEnv } from './preflight';

const nodeEnv = process.env.NODE_ENV ?? 'development';

/**
 * Fail fast on a broken configuration instead of serving a subtly broken API.
 *
 * The rules live in `src/preflight.ts` and are shared with `npm run preflight`,
 * so what the host reports at boot is exactly what a pre-deploy check reports.
 * Warnings pass: they cover setups that work but usually indicate a mistake.
 */
const issues = checkDeployEnv(process.env, { prod: nodeEnv === 'production' });
for (const issue of issues) {
  if (issue.level === 'warning') {
    console.warn(`[env] warning: ${issue.message}${issue.hint ? ` ${issue.hint}` : ''}`);
  }
}
const errors = issues.filter((issue) => issue.level === 'error');
if (errors.length > 0) {
  throw new Error(
    [
      'Server configuration is invalid:',
      ...errors.map((e) => `- ${e.message}${e.hint ? `\n    ${e.hint}` : ''}`),
      'See server/.env.example and docs/DEPLOY.md.',
    ].join('\n'),
  );
}

/** checkDeployEnv above rejects missing values; re-read for type safety. */
function read(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name} (see server/.env.example)`);
  return v;
}

export const env = {
  port: Number(process.env.PORT || 4000),
  nodeEnv,
  // A trailing slash would never match the browser's origin string in CORS or
  // cookie scope, so strip it rather than let it break silently.
  frontendOrigin: (process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173')
    .trim()
    .replace(/\/+$/, ''),
  databaseUrl: read('DATABASE_URL'),
  jwtSecret: read('JWT_SECRET'),
};

export const isProd = nodeEnv === 'production';
