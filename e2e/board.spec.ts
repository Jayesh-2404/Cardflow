import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * The suite runs against a real API and a real Postgres journal. Registration
 * locks after the first account, so the account is provisioned out of band by
 * `npm run e2e:seed` (see README) and reused here.
 */
const API = process.env.E2E_API_URL ?? 'http://localhost:4000';
const E2E_EMAIL = process.env.E2E_EMAIL ?? 'e2e-local@kb.test';
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? 'e2e-local-pass';

const card = (page: Page, title: string) =>
  page.locator('[data-testid=task-card]', { hasText: title }).first();

/**
 * Reset to Todo/Doing/Done through the API. Uses the `request` fixture rather
 * than `page.request` so the call is not subject to cross-origin CORS; that
 * fixture has its own cookie jar, so it logs in first.
 */
async function resetBoard(request: APIRequestContext, page: Page): Promise<void> {
  const auth = await request.post(`${API}/api/auth/login`, {
    data: { email: E2E_EMAIL, password: E2E_PASSWORD },
    timeout: 30_000,
  });
  expect(auth.ok(), `e2e login failed: ${auth.status()}`).toBeTruthy();

  // Reset is a multi-statement transaction against a remote Postgres, so it
  // gets its own budget rather than the 7s UI action timeout.
  const res = await request.post(`${API}/api/board/reset`, { data: {}, timeout: 30_000 });
  expect(res.ok(), `board reset failed: ${res.status()}`).toBeTruthy();
  await page.reload();
  await expect(page.getByTestId('board-column').first()).toBeVisible();
}

async function login(page: Page): Promise<void> {
  await page.goto('/');
  // Wait for boot to settle before deciding: the login form and the board
  // swap in asynchronously, so checking too early races the session fetch.
  await expect(
    page.getByTestId('login-form').or(page.getByTestId('board-column').first()),
  ).toBeVisible();
  if (await page.getByTestId('login-form').isVisible()) {
    await page.getByTestId('email').fill(E2E_EMAIL);
    await page.getByTestId('password').fill(E2E_PASSWORD);
    await page.getByTestId('submit').click();
  }
  await expect(page.getByTestId('board-column').first()).toBeVisible();
}

/** Rows carry the event type in a data attribute, not in the testid. */
const rowOf = (page: Page, type: string) =>
  page.locator(`[data-testid=timeline-row][data-type=${type}]`);

/**
 * Mobile renders one list at a time behind tabs, so a test that needs a card
 * in a specific list has to switch to it first. No-op on desktop.
 */
async function showList(page: Page, name: string): Promise<void> {
  const tab = page.locator('[data-testid=mobile-tab]', { hasText: name }).first();
  if (await tab.isVisible().catch(() => false)) {
    await tab.click();
  }
}

test.beforeEach(async ({ page, request }) => {
  await login(page);
  await resetBoard(request, page);
});

test.describe('board', () => {

  test('quick-add creates a card and it lands in the list', async ({ page }) => {
    const todo = page.getByTestId('board-column').first();
    await todo.getByTestId('quick-add').click();
    await todo.getByTestId('quick-add-input').fill('Write the retro summary');
    await todo.getByTestId('quick-add-submit').click();

    await expect(card(page, 'Write the retro summary')).toBeVisible();
  });

  test('editing a card writes a journal entry naming the changed fields', async ({ page }) => {
    await card(page, 'Welcome — drag me to Doing').click();
    await page.getByTestId('editor-priority').selectOption('high');
    await page.getByTestId('editor-save').click();

    await card(page, 'Welcome — drag me to Doing').click();
    await expect(rowOf(page, 'updated')).toContainText('priority');
  });

  test('a card shows an entry count that grows as notes are logged', async ({ page }) => {
    await card(page, 'Welcome — drag me to Doing').click();
    await expect(page.getByTestId('timeline-row')).toHaveCount(1);

    await page.getByTestId('note-input').fill('Kicked off the migration plan.');
    await page.getByTestId('note-submit').click();
    await expect(page.getByTestId('timeline-row')).toHaveCount(2);

    await page.getByTestId('editor-close').click();
    await expect(card(page, 'Welcome — drag me to Doing').getByTestId('entry-count')).toHaveText('2');
  });

  test('notes survive a reload because they are persisted, not local state', async ({ page }) => {
    await card(page, 'Welcome — drag me to Doing').click();
    const note = 'Persisted across a full page reload.';
    await page.getByTestId('note-input').fill(note);
    await page.getByTestId('note-submit').click();
    await expect(page.getByTestId('timeline-row').last()).toContainText(note);

    await page.reload();
    await card(page, 'Welcome — drag me to Doing').click();
    await expect(page.getByTestId('timeline')).toContainText(note);
  });

  test('moving a card to another list is journalled with both list names', async ({ page }) => {
    await card(page, 'Welcome — drag me to Doing').click();
    await page.getByTestId('editor-column').selectOption({ label: 'Doing' });
    await page.getByTestId('editor-save').click();

    await showList(page, 'Doing');
    await card(page, 'Welcome — drag me to Doing').click();
    await expect(rowOf(page, 'moved')).toContainText('Todo');
    await expect(rowOf(page, 'moved')).toContainText('Doing');
  });

  test('archiving removes the card from the board but keeps its journal', async ({ page }) => {
    await card(page, 'Welcome — drag me to Doing').click();
    await page.getByTestId('editor-archive').click();
    await expect(page.getByTestId('task-card')).toHaveCount(0);

    await page.getByTestId('rail-archive').click();
    await expect(page.getByTestId('side-panel')).toContainText('Welcome — drag me to Doing');
  });
});

test.describe('journal panel', () => {
  test('feed lists entries and filters down to notes only', async ({ page }) => {
    await card(page, 'Welcome — drag me to Doing').click();
    await page.getByTestId('note-input').fill('Only a note in this feed.');
    await page.getByTestId('note-submit').click();
    await page.getByTestId('editor-close').click();

    await page.getByTestId('rail-journal').click();
    await expect(page.getByTestId('journal-panel')).toContainText('Only a note in this feed.');

    await page.getByTestId('journal-filter-note').click();
    await expect(page.getByTestId('journal-item')).toHaveCount(1);
  });

  test('clicking an entry opens the card it belongs to', async ({ page }) => {
    await card(page, 'Welcome — drag me to Doing').click();
    await page.getByTestId('note-input').fill('Jump target.');
    await page.getByTestId('note-submit').click();
    await page.getByTestId('editor-close').click();

    await page.getByTestId('rail-journal').click();
    await page.getByTestId('journal-item').first().click();
    await expect(page.getByTestId('editor-title')).toHaveValue('Welcome — drag me to Doing');
  });
});

test.describe('keyboard', () => {
  test('Ctrl+K opens the palette and fuzzy search finds a card', async ({ page }) => {
    await page.keyboard.press('Control+k');
    await expect(page.getByTestId('command-palette')).toBeVisible();

    await page.getByTestId('palette-input').fill('wlcm');
    await expect(page.getByTestId('palette-item')).toHaveCount(1);
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('editor-title')).toHaveValue('Welcome — drag me to Doing');
  });

  test('Escape peels palette, then editor, then panel', async ({ page }) => {
    await page.keyboard.press('Control+k');
    await expect(page.getByTestId('command-palette')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('command-palette')).toHaveCount(0);

    await card(page, 'Welcome — drag me to Doing').click();
    await expect(page.getByTestId('task-editor')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('task-editor')).toHaveCount(0);

    await page.keyboard.press('f');
    await expect(page.getByTestId('side-panel')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('side-panel')).toHaveCount(0);
  });

  test('N opens a new task editor and J opens the journal', async ({ page }) => {
    await page.keyboard.press('n');
    await expect(page.getByTestId('editor-title')).toHaveValue('');
    await page.keyboard.press('Escape');

    await page.keyboard.press('j');
    await expect(page.getByTestId('journal-panel')).toBeVisible();
  });
});

test.describe('filters', () => {
  test('priority filter narrows the board and the badge counts it', async ({ page }) => {
    const todo = page.getByTestId('board-column').first();
    await todo.getByTestId('quick-add').click();
    await todo.getByTestId('quick-add-input').fill('Urgent one');
    await todo.getByTestId('quick-add-submit').click();

    await card(page, 'Urgent one').click();
    await page.getByTestId('editor-priority').selectOption('high');
    await page.getByTestId('editor-save').click();

    await page.getByTestId('open-filters').click();
    await page.getByTestId('filter-priority-high').click();
    await expect(page.getByTestId('open-filters')).toContainText('1');

    await expect(card(page, 'Urgent one')).toBeVisible();
    await expect(card(page, 'Welcome — drag me to Doing')).toHaveCount(0);
  });
});
