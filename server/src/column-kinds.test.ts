import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COLUMN_KINDS,
  COLUMN_TITLES,
  deriveAgentState,
  isColumnKind,
  kindFromTitle,
} from './column-kinds';

test('the four kinds have one default title each, in board order', () => {
  assert.deepEqual(COLUMN_KINDS, ['todo', 'active', 'review', 'done']);
  assert.deepEqual(
    COLUMN_KINDS.map((k) => COLUMN_TITLES[k]),
    ['Todo', 'Doing', 'Under Review', 'Done'],
  );
});

test('isColumnKind accepts only the four kinds', () => {
  for (const kind of COLUMN_KINDS) assert.equal(isColumnKind(kind), true, kind);
  for (const value of ['Done', 'doing', '', null, undefined, 3, 'blocked']) {
    assert.equal(isColumnKind(value), false, String(value));
  }
});

test('kindFromTitle maps old list names onto the fixed kinds', () => {
  const cases: [string, string][] = [
    ['Todo', 'todo'],
    ['To Do', 'todo'],
    ['Backlog', 'todo'],
    ['Doing', 'active'],
    ['In Progress', 'active'],
    ['in-progress', 'active'],
    ['Active', 'active'],
    ['Under Review', 'review'],
    ['Review', 'review'],
    ['In Review', 'review'],
    ['Done', 'done'],
    ['Completed', 'done'],
    ['Done After the review', 'done'],
    ['Something else', 'active'],
  ];
  for (const [title, kind] of cases) {
    assert.equal(kindFromTitle(title), kind, title);
  }
});

test('a live run makes a card running, but a done list always wins', () => {
  assert.equal(deriveAgentState('todo'), 'idle');
  assert.equal(deriveAgentState('active'), 'idle');
  assert.equal(deriveAgentState('review'), 'under-review');
  assert.equal(deriveAgentState('done'), 'completed');

  assert.equal(deriveAgentState('active', 'claimed'), 'running');
  assert.equal(deriveAgentState('active', 'running'), 'running');
  assert.equal(deriveAgentState('active', 'review'), 'under-review');
  assert.equal(deriveAgentState('todo', 'abandoned'), 'idle');
  assert.equal(deriveAgentState('review', 'running'), 'running');
  assert.equal(deriveAgentState('done', 'running'), 'completed');
});
