/**
 * Pre-deploy environment check.
 *
 *   cd server
 *   npm run preflight          # production rules, for the values the host will get
 *   npm run preflight:dev      # relaxed sanity check for local development
 *   (tsx scripts/preflight.ts --dev does the same when called directly)
 *
 * Reads process.env plus server/.env (dotenv; real env vars win). Prints one
 * line per finding and exits non-zero on errors, so it can gate a deploy.
 * Plain Node output, no shell syntax, so it behaves the same in PowerShell,
 * cmd and bash.
 */
import 'dotenv/config';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { checkDeployEnv } from '../src/preflight';

const dev = process.argv.includes('--dev');
const prod = !dev;

console.log(
  `kanban-server preflight (${prod ? 'production' : 'development'} rules, node ${process.version})`,
);
const envFile = join(process.cwd(), '.env');
console.log(existsSync(envFile) ? `loaded env file: ${envFile}` : 'no server/.env found; checking process environment only');
console.log('');

const issues = checkDeployEnv(process.env, { prod });
for (const issue of issues) {
  const tag = issue.level === 'error' ? 'FAIL' : 'WARN';
  console.log(`[${tag}] ${issue.message}`);
  if (issue.hint) console.log(`       ${issue.hint}`);
}
if (issues.length === 0) console.log('[ok] every checked value looks deployable.');

const errorCount = issues.filter((i) => i.level === 'error').length;
const warningCount = issues.length - errorCount;
console.log('');
console.log(`${errorCount} error(s), ${warningCount} warning(s)`);
if (errorCount > 0) process.exitCode = 1;
