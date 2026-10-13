import test from 'node:test';
import assert from 'node:assert/strict';
import { __resetRateLimit, authLimiter } from './rateLimit';

test('auth limiter caps bursts per window', () => {
  __resetRateLimit();
  const mw = authLimiter(2, 60_000);
  let next = 0;
  let status = 0;
  const req = { ip: '1.2.3.4', socket: {} } as unknown as import('express').Request;
  const res = {
    status(c: number) {
      status = c;
      return this;
    },
    json() {},
  } as unknown as import('express').Response;
  const nx = () => {
    next += 1;
  };
  mw(req, res, nx);
  mw(req, res, nx);
  mw(req, res, nx);
  assert.equal(next, 2);
  assert.equal(status, 429);
});
