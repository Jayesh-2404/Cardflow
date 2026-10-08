/**
 * Rules behind the MCP list/move tools. No database, no auth token — these run
 * in milliseconds and are the regression net for issues #1, #2 and #3.
 *
 *   npm test        (in server/)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_TZ,
  DONE_ADVICE,
  agentColumn,
  isDoneTitle,
  selectOpenTasks,
  todayInTz,
} from './mcp-filters';
import type { BoardColumnDTO, BoardTaskDTO } from './board';

// --- fixtures -----------------------------------------------------------------

const columns: BoardColumnDTO[] = [
  { id: 'c-todo', title: 'Todo' },
  { id: 'c-doing', title: 'Doing' },
  { id: 'c-done', title: 'Done' },
];

let seq = 0;
function task(over: Partial<BoardTaskDTO> = {}): BoardTaskDTO {
  seq += 1;
  return {
    id: `t${seq}`,
    columnId: 'c-todo',
    title: `task ${seq}`,
    description: '',
    priority: 'medium',
    dueDate: '2026-10-09',
    tags: [],
    archived: false,
    projectKey: 'zex',
    agentState: 'idle',
    gitEnabled: false,
    branch: null,
    lastCommit: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...over,
  };
}

const ids = (rows: BoardTaskDTO[]) => rows.map((r) => r.id);

// --- issue #1: today is local, not UTC ----------------------------------------

test('todayInTz returns the local day, not the UTC day', () => {
  // 2026-10-09 00:15 in IST is still 2026-10-08 in UTC — the exact window where
  // the old toISOString().slice(0,10) handed back yesterday's cards.
  const justAfterMidnightIst = new Date('2026-10-08T18:45:00.000Z');
  assert.equal(todayInTz(justAfterMidnightIst, DEFAULT_TZ), '2026-10-09');
  assert.equal(todayInTz(justAfterMidnightIst, 'UTC'), '2026-10-08');
});

test('todayInTz agrees with UTC once IST has rolled past 05:30', () => {
  const midday = new Date('2026-10-08T06:00:00.000Z'); // 11:30 IST
  assert.equal(todayInTz(midday, DEFAULT_TZ), '2026-10-08');

  const justBeforeMidnight = new Date('2026-10-08T18:29:59.000Z'); // 23:59:59 IST
  assert.equal(todayInTz(justBeforeMidnight, DEFAULT_TZ), '2026-10-08');
});

test('todayInTz honours KANBAN_TZ and defaults to Asia/Kolkata', () => {
  const instant = new Date('2026-10-08T18:45:00.000Z');
  const saved = process.env.KANBAN_TZ;
  try {
    process.env.KANBAN_TZ = 'UTC';
    assert.equal(todayInTz(instant), '2026-10-08');

    delete process.env.KANBAN_TZ;
    assert.equal(todayInTz(instant), '2026-10-09');

    // An empty value is not a timezone.
    process.env.KANBAN_TZ = '';
    assert.equal(todayInTz(instant), '2026-10-09');
  } finally {
    if (saved === undefined) delete process.env.KANBAN_TZ;
    else process.env.KANBAN_TZ = saved;
  }
});

test('todayInTz falls back to the host date instead of throwing on a bad zone', () => {
  const now = new Date('2026-10-08T12:00:00.000Z');
  const pad = (n: number) => String(n).padStart(2, '0');
  const local = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  assert.equal(todayInTz(now, 'Not/AZone'), local);
});

// --- issue #2: Done cards are not open work -----------------------------------

test('isDoneTitle matches the Done list however the user spelled it', () => {
  for (const title of ['Done', 'done', 'DONE', '  Done  ']) {
    assert.equal(isDoneTitle(title), true, title);
  }
  for (const title of ['Doing', 'Todo', 'Shipped', 'done later', 'To Do']) {
    assert.equal(isDoneTitle(title), false, title);
  }
});

test('selectOpenTasks drops a Done task due today', () => {
  const open = task({ id: 'open', columnId: 'c-todo' });
  const finished = task({ id: 'finished', columnId: 'c-done' });
  const got = ids(selectOpenTasks({ tasks: [finished, open], columns, date: '2026-10-09' }));
  assert.deepEqual(got, ['open']);
});

test('selectOpenTasks drops Done regardless of the list title casing', () => {
  const renamed: BoardColumnDTO[] = [
    { id: 'c-todo', title: 'Todo' },
    { id: 'c-done', title: 'DONE' },
  ];
  const finished = task({ id: 'finished', columnId: 'c-done' });
  const got = selectOpenTasks({ tasks: [finished], columns: renamed, date: '2026-10-09' });
  assert.deepEqual(ids(got), []);
});

test('selectOpenTasks can be asked for finished work on purpose', () => {
  const finished = task({ id: 'finished', columnId: 'c-done' });
  const got = selectOpenTasks({
    tasks: [finished],
    columns,
    date: '2026-10-09',
    excludeDone: false,
  });
  assert.deepEqual(ids(got), ['finished']);
});

test('selectOpenTasks still filters archived, date, project, limit and priority', () => {
  const due = { dueDate: '2026-10-09' };
  const rows = [
    task({ id: 'archived', ...due, archived: true }),
    task({ id: 'tomorrow', ...due, dueDate: '2026-10-10' }),
    task({ id: 'undated', dueDate: null }),
    task({ id: 'other-project', ...due, projectKey: 'other' }),
    task({ id: 'low', ...due, priority: 'low' }),
    task({ id: 'medium', ...due, priority: 'medium' }),
    task({ id: 'high', ...due, priority: 'high' }),
  ];

  // No project filter, so 'other-project' is in too; medium ties keep input order.
  assert.deepEqual(ids(selectOpenTasks({ tasks: rows, columns, date: '2026-10-09' })), [
    'high',
    'other-project',
    'medium',
    'low',
  ]);

  assert.deepEqual(
    ids(selectOpenTasks({ tasks: rows, columns, date: '2026-10-09', project: 'other' })),
    ['other-project'],
  );

  assert.deepEqual(
    ids(selectOpenTasks({ tasks: rows, columns, date: '2026-10-09', limit: 2 })),
    ['high', 'other-project'],
  );
});

test('selectOpenTasks does not mutate the caller\'s task array', () => {
  const rows = [
    task({ id: 'low', priority: 'low' }),
    task({ id: 'high', priority: 'high' }),
  ];
  selectOpenTasks({ tasks: rows, columns, date: '2026-10-09' });
  assert.deepEqual(rows.map((r) => r.id), ['low', 'high']);
});

// --- issue #3: an agent may not mark a card Done -------------------------------

test('update_status accepts Todo and Doing', () => {
  assert.equal(agentColumn.safeParse('Todo').success, true);
  assert.equal(agentColumn.safeParse('Doing').success, true);
  assert.equal(agentColumn.optional().safeParse(undefined).success, true);
});

test('update_status rejects Done with advice, and never advertises it', () => {
  const parsed = agentColumn.safeParse('Done');
  assert.equal(parsed.success, false);
  if (!parsed.success) assert.equal(parsed.error.issues[0].message, DONE_ADVICE);

  // 'Done' must not be in the schema the model is shown, or it will keep trying.
  const values = (agentColumn as unknown as { _def: { values: string[] } })._def.values;
  assert.ok(!values.includes('Done'), `schema exposes ${values.join(', ')}`);
  assert.deepEqual(values, ['Todo', 'Doing']);
});

test('update_status rejects an unknown list with the same advice', () => {
  const parsed = agentColumn.safeParse('Shipped');
  assert.equal(parsed.success, false);
  if (!parsed.success) {
    assert.match(parsed.error.issues[0].message, /under-review/);
    assert.match(parsed.error.issues[0].message, /never mark a card Done/);
  }
});

// --- wiring -------------------------------------------------------------------
//
// The tests above pin the rules themselves. These two pin that mcp.ts actually
// calls them, since mcp.ts runs a stdio server on import and cannot be imported
// by a unit test. A cheap source check beats nothing.

const mcpSource = readFileSync(join(__dirname, 'mcp.ts'), 'utf8');

test('mcp.ts resolves today through todayInTz, not the UTC date', () => {
  assert.match(mcpSource, /date:\s*todayInTz\(\)/);
  // `new Date().toISOString().slice(0, 10)` is the bug from issue #1.
  assert.doesNotMatch(mcpSource, /toISOString\(\)\.slice\(0,\s*10\)/);
});

test('mcp.ts fences update_status with agentColumn and never offers Done', () => {
  assert.match(mcpSource, /column:\s*agentColumn\.optional\(\)/);
  assert.doesNotMatch(mcpSource, /z\.enum\(\[[^\]]*'Done'[^\]]*\]\)/);
});