import test from 'node:test';
import assert from 'node:assert/strict';
import { __resetRealtime, addClient, bump, clientCount, versionFor } from './realtime';

function fakeRes() {
  const chunks: string[] = [];
  const res = {
    chunks,
    write(s: string) {
      chunks.push(s);
      return true;
    },
  };
  return res as unknown as import('express').Response & { chunks: string[] };
}

test('bump increments version and pushes to that user only', () => {
  __resetRealtime();
  const a = fakeRes();
  const b = fakeRes();
  const rmA = addClient('u-a', a);
  addClient('u-b', b);
  assert.equal(versionFor('u-a'), 0);
  bump('u-a');
  assert.equal(versionFor('u-a'), 1);
  assert.equal(versionFor('u-b'), 0);
  assert.ok(a.chunks.join('').includes('"v":1'));
  assert.ok(!b.chunks.join('').includes('"v":1'));
  assert.equal(clientCount('u-a'), 1);
  rmA();
  assert.equal(clientCount('u-a'), 0);
});
