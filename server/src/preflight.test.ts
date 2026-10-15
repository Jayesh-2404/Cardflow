import test from 'node:test';
import assert from 'node:assert/strict';
import { checkDeployEnv, type EnvCheckIssue } from './preflight';

/** A production env where every check passes. Individual tests break one thing. */
function goodProd(): Record<string, string> {
  return {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://u:p@ep-x-pooler.us-east-2.aws.neon.tech/kanban?sslmode=require',
    DIRECT_URL: 'postgresql://u:p@ep-x.us-east-2.aws.neon.tech/kanban?sslmode=require',
    JWT_SECRET: 'S3JIeP0nzb3WzU7UPH4WzRq2XL1f3LdU5qZX1v6yQxk=',
    FRONTEND_ORIGIN: 'https://my-board.vercel.app',
  };
}

const errors = (issues: EnvCheckIssue[]) =>
  issues.filter((i) => i.level === 'error').map((i) => i.message);
const warnings = (issues: EnvCheckIssue[]) =>
  issues.filter((i) => i.level === 'warning').map((i) => i.message);

test('a clean production env produces no issues at all', () => {
  assert.deepEqual(checkDeployEnv(goodProd(), { prod: true }), []);
});

test('dev mode ignores production-only rules but still checks the basics', () => {
  const issues = checkDeployEnv(
    { DATABASE_URL: goodProd().DATABASE_URL, DIRECT_URL: goodProd().DIRECT_URL, JWT_SECRET: goodProd().JWT_SECRET },
    { prod: false },
  );
  assert.deepEqual(issues, []);
});

test('missing DATABASE_URL and DIRECT_URL are both reported', () => {
  const env = goodProd();
  delete env.DATABASE_URL;
  delete env.DIRECT_URL;
  const messages = errors(checkDeployEnv(env, { prod: true }));
  assert.ok(messages.some((m) => m.includes('DATABASE_URL is not set')));
  assert.ok(messages.some((m) => m.includes('DIRECT_URL is not set')));
});

test('a non-postgres DATABASE_URL is an error, a pooler DIRECT_URL is only a warning', () => {
  const env = goodProd();
  env.DATABASE_URL = 'mysql://root@localhost/db';
  env.DIRECT_URL = 'postgresql://u:p@ep-x-pooler.us-east-2.aws.neon.tech/kanban';
  const issues = checkDeployEnv(env, { prod: true });
  assert.ok(errors(issues).some((m) => m.includes('does not look like a Postgres URL')));
  assert.ok(warnings(issues).some((m) => m.includes('DIRECT_URL looks pooled')));
});

test('a DATABASE_URL without sslmode warns but stays deployable', () => {
  const env = goodProd();
  env.DATABASE_URL = 'postgresql://u:p@ep-x-pooler.us-east-2.aws.neon.tech/kanban';
  const issues = checkDeployEnv(env, { prod: true });
  assert.deepEqual(errors(issues), []);
  assert.ok(warnings(issues).some((m) => m.includes('sslmode')));
});

test('short and placeholder JWT secrets are rejected', () => {
  const short = goodProd();
  short.JWT_SECRET = 'too-short';
  assert.ok(
    errors(checkDeployEnv(short, { prod: true })).some(
      (m) => m.includes('JWT_SECRET is only') && m.includes('32 is the minimum'),
    ),
  );

  const placeholder = goodProd();
  placeholder.JWT_SECRET = 'CHANGE-ME-CHANGE-ME-0123456789abcdef';
  assert.ok(
    errors(checkDeployEnv(placeholder, { prod: true })).some((m) => m.includes('placeholder text')),
  );
});

test('a malformed PORT is rejected, a good one is not', () => {
  const bad = goodProd();
  bad.PORT = 'http';
  assert.ok(errors(checkDeployEnv(bad, { prod: true })).some((m) => m.includes('valid port number')));

  const ok = goodProd();
  ok.PORT = '4000';
  assert.deepEqual(checkDeployEnv(ok, { prod: true }), []);
});

test('production requires NODE_ENV=production', () => {
  const env = goodProd();
  env.NODE_ENV = 'development';
  assert.ok(
    errors(checkDeployEnv(env, { prod: true })).some((m) => m.includes('NODE_ENV=production')),
  );
});

test('production requires an absolute, https, non-localhost FRONTEND_ORIGIN', () => {
  const cases: [string | undefined, string][] = [
    [undefined, 'FRONTEND_ORIGIN is not set'],
    ['localhost:5173', 'not a bare origin'],
    ['https://my-board.vercel.app/', 'not a bare origin'],
    ['https://my-board.vercel.app/path', 'not a bare origin'],
    ['http://my-board.vercel.app', 'must be https'],
    ['http://localhost:5173', 'points at localhost'],
  ];
  for (const [origin, expected] of cases) {
    const env = goodProd();
    if (origin === undefined) delete env.FRONTEND_ORIGIN;
    else env.FRONTEND_ORIGIN = origin;
    const messages = errors(checkDeployEnv(env, { prod: true }));
    assert.ok(
      messages.some((m) => m.includes(expected)),
      `expected "${expected}" for FRONTEND_ORIGIN=${origin}, got: ${JSON.stringify(messages)}`,
    );
  }
});
