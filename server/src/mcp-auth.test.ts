import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenMatches } from './mcp-auth';

const TOKEN = 'a'.repeat(64);

test('an exact token matches', () => {
  assert.equal(tokenMatches(TOKEN, TOKEN), true);
});

test('a wrong token, a prefix and a longer string do not match', () => {
  assert.equal(tokenMatches('b'.repeat(64), TOKEN), false);
  assert.equal(tokenMatches(TOKEN.slice(0, 63), TOKEN), false);
  assert.equal(tokenMatches(`${TOKEN}a`, TOKEN), false);
});

test('empty values never match, including empty against empty', () => {
  assert.equal(tokenMatches('', TOKEN), false);
  assert.equal(tokenMatches(TOKEN, ''), false);
  assert.equal(tokenMatches('', ''), false);
});

test('matching is case-sensitive', () => {
  assert.equal(tokenMatches(TOKEN.toUpperCase(), TOKEN), false);
});
