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
import { DEFAULT_TZ, branchFor, rankOpenTasks, runDuration, selectOpenTasks, todayInTz } from './mcp-filters';
import type { BoardColumnDTO, BoardTaskDTO } from './board';

// --- fixtures -----------------------------------------------------------------

const columns: BoardColumnDTO[] = [
  { id: 'c-todo', title: 'Todo', kind: 'todo' },
  { id: 'c-doing', title: 'Doing', kind: 'active' },
  { id: 'c-review', title: 'Under Review', kind: 'review' },
  { id: 'c-done', title: 'Done', kind: 'done' },
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
    run: null,
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

test('selectOpenTasks drops a Done task due today', () => {
  const open = task({ id: 'open', columnId: 'c-todo' });
  const finished = task({ id: 'finished', columnId: 'c-done' });
  const got = ids(selectOpenTasks({ tasks: [finished, open], columns, date: '2026-10-09' }));
  assert.deepEqual(got, ['open']);
});

test('selectOpenTasks follows the kind, so a renamed Done list still excludes', () => {
  const renamed: BoardColumnDTO[] = [
    { id: 'c-todo', title: 'Todo', kind: 'todo' },
    { id: 'c-shipped', title: 'Shipped', kind: 'done' },
  ];
  const finished = task({ id: 'finished', columnId: 'c-shipped' });
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

// --- the picker behind pick_task ------------------------------------------------

test('rankOpenTasks orders high priority, then due date, then input order', () => {
  const rows = [
    task({ id: 'low-old', priority: 'low', dueDate: '2026-10-01' }),
    task({ id: 'high-undated', priority: 'high', dueDate: null }),
    task({ id: 'high-due', priority: 'high', dueDate: '2026-10-09' }),
    task({ id: 'medium', priority: 'medium', dueDate: '2026-10-02' }),
    task({ id: 'high-late', priority: 'high', dueDate: '2026-10-20' }),
    task({ id: 'high-due-2', priority: 'high', dueDate: '2026-10-09' }),
  ];
  assert.deepEqual(ids(rankOpenTasks(rows, columns)), [
    'high-due',
    'high-due-2',
    'high-late',
    'high-undated',
    'medium',
    'low-old',
  ]);
});

test('rankOpenTasks only returns idle cards in Todo', () => {
  const rows = [
    task({ id: 'todo' }),
    task({ id: 'doing', columnId: 'c-doing' }),
    task({ id: 'review', columnId: 'c-review' }),
    task({ id: 'done', columnId: 'c-done' }),
    task({ id: 'archived', archived: true }),
    task({ id: 'running', agentState: 'running' }),
    task({ id: 'held', agentState: 'under-review' }),
  ];
  assert.deepEqual(ids(rankOpenTasks(rows, columns)), ['todo']);
});

test('rankOpenTasks does not mutate the caller\'s task array', () => {
  const rows = [
    task({ id: 'low', priority: 'low' }),
    task({ id: 'high', priority: 'high' }),
  ];
  rankOpenTasks(rows, columns);
  assert.deepEqual(rows.map((r) => r.id), ['low', 'high']);
});

// --- issue #3: an agent may not mark a card Done -------------------------------

// The refusal lives in the API route, not the MCP process: the route knows the
// target list's kind, so a renamed Done list cannot be used to get around it.
const boardSource = readFileSync(join(__dirname, 'routes', 'board.ts'), 'utf8');
const mcpSource = readFileSync(join(__dirname, 'mcp.ts'), 'utf8');

test('the API refuses an MCP move into a done-kind list, whatever its title', () => {
  assert.match(boardSource, /col\.kind === 'done' && viaMcp\(req\)/);
  assert.match(boardSource, /Agents must not move a card to Done/);
  assert.match(boardSource, /Under Review/);
});

test('the MCP no longer re-implements the Done rule by title', () => {
  assert.doesNotMatch(mcpSource, /isDoneTitle/);
  assert.match(mcpSource, /Never move a card into a Done list/);
});

// --- run names -----------------------------------------------------------------

test('branchFor keeps the branch valid and under the length cap', () => {
  const branch = branchFor({ id: 'task-abcdef', title: 'Make the PR for Zex: fix bugs!' });
  assert.match(branch, /^kanban\/[a-z0-9-]+$/);
  assert.ok(branch.length <= 128, branch);
  assert.match(branch, /abcdef/);
});

test('runDuration stays readable at seconds, minutes and hours', () => {
  assert.equal(runDuration(5_000), '5s');
  assert.equal(runDuration(12 * 60_000), '12m');
  assert.equal(runDuration(65 * 60_000), '1h 05m');
});

// --- wiring -------------------------------------------------------------------

test('mcp.ts resolves today through todayInTz, not the UTC date', () => {
  assert.match(mcpSource, /date:\s*todayInTz\(\)/);
  // `new Date().toISOString().slice(0, 10)` is the bug from issue #1.
  assert.doesNotMatch(mcpSource, /toISOString\(\)\.slice\(0,\s*10\)/);
});
