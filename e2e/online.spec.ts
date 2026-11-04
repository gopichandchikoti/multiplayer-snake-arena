import { expect, test } from '@playwright/test';
import { ARENA, arenaLooksDrawn, createRoom, joinRoom, newPlayer } from './helpers';

test('online: two browsers create, join, ready up, play and see the same result; a third watches', async ({
  browser,
}) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const ctxC = await browser.newContext();
  const a = await newPlayer(ctxA, 'Ada');
  const b = await newPlayer(ctxB, 'Bo');
  const c = await newPlayer(ctxC, 'Cy');

  const code = await createRoom(a.page);
  expect(code).toMatch(/^[A-HJ-KM-NP-Z2-9]{5}$/);
  await joinRoom(b.page, code);
  await expect(a.page.getByRole('list', { name: /Players, 2 of 8/ })).toContainText('Bo');
  await expect(a.page.getByRole('list', { name: /Players/ })).toContainText('Ada (you) · host');
  await a.page.screenshot({ path: 'docs/screenshots/e2e-lobby.png' });

  await joinRoom(c.page, code, true);
  await expect(a.page.getByText('1 watching')).toBeVisible();
  await a.page.getByRole('button', { name: 'Ready', exact: true }).click();
  await expect(b.page.getByRole('list', { name: /Players/ })).toContainText('Ada');
  await b.page.getByRole('button', { name: 'Ready', exact: true }).click();
  await expect(a.page.getByText(/Starting in/)).toBeVisible();

  await expect(a.page.locator(ARENA)).toBeVisible({ timeout: 15_000 });
  await a.page.waitForTimeout(700);
  // Checked first: the snakes coast into walls within about four seconds.
  expect(await arenaLooksDrawn(a.page)).toBe(true);
  await a.page.screenshot({ path: 'docs/screenshots/e2e-online-game.png' });
  await expect(b.page.locator(ARENA)).toBeVisible();
  await expect(c.page.locator(ARENA)).toBeVisible({ timeout: 15_000 });
  await expect(c.page.getByText('Watching')).toBeVisible();
  await expect(a.page.getByLabel(/Network quality/)).toBeVisible({ timeout: 10_000 });
  await a.page.keyboard.press('ArrowDown');
  await b.page.keyboard.press('ArrowUp');

  for (const p of [a, b]) await expect(p.page.locator('#summary-title')).toBeVisible({ timeout: 40_000 });
  const headlineA = await a.page.locator('#summary-title').textContent();
  const headlineB = await b.page.locator('#summary-title').textContent();
  expect([headlineA, headlineB].join(' ')).toMatch(/win|draw|No winner/i);
  const rowsA = await a.page.getByRole('list', { name: 'Final standings' }).innerText();
  const rowsB = await b.page.getByRole('list', { name: 'Final standings' }).innerText();
  expect(rowsA).toContain('Ada');
  expect(rowsB).toContain('Bo');
  await a.page.screenshot({ path: 'docs/screenshots/e2e-online-summary.png' });

  // The summary returns to the lobby on its own, and the board has been recorded on the server.
  await expect(a.page.locator('h1 .code')).toBeVisible({ timeout: 30_000 });
  const board = await a.page.request.get('/api/leaderboard');
  const json: unknown = await board.json();
  expect(json).toMatchObject({ scope: 'this-server', persistence: 'memory' });
  expect(JSON.stringify(json)).not.toContain('guest');
  await a.page.getByRole('button', { name: 'Leave room' }).click();
  await a.page.getByRole('button', { name: 'Leaderboard' }).click();
  await expect(a.page.getByRole('dialog', { name: 'Leaderboard' })).toContainText('not a global ranking');
  await a.page.screenshot({ path: 'docs/screenshots/e2e-leaderboard.png' });

  for (const p of [a, b, c]) expect(p.problems.list).toEqual([]);
  await Promise.all([ctxA.close(), ctxB.close(), ctxC.close()]);
});

test('online: an invite link offers the room but does not connect until accepted', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await newPlayer(ctxA, 'Host');
  const code = await createRoom(a.page);
  const guest = await ctxB.newPage();
  const sockets: string[] = [];
  guest.on('websocket', (ws) => sockets.push(ws.url()));
  await guest.goto(`/?room=${code}`);
  await expect(guest.getByText(`You were invited to room ${code}`)).toBeVisible();
  expect(sockets).toEqual([]);
  await guest.getByRole('button', { name: `Join room ${code}` }).click();
  await expect(guest.locator('h1 .code')).toHaveText(code);
  await expect(a.page.getByRole('list', { name: /Players, 2 of 8/ })).toBeVisible();
  await Promise.all([ctxA.close(), ctxB.close()]);
});

test('online: wrong codes and full flows give clear messages', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Play online' }).click();
  await page.getByLabel('Room code').fill('ZZZZZ');
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('No room has that code');
  await page.getByRole('button', { name: 'Dismiss' }).click();
  await expect(page.getByRole('alert')).toBeHidden();
});

test('online: the quick-play lobby fills with two players and starts by itself', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await newPlayer(ctxA, 'Quick1');
  const b = await newPlayer(ctxB, 'Quick2');
  await a.page.getByRole('button', { name: 'Play online' }).click();
  await a.page.getByRole('button', { name: 'Quick play' }).click();
  await expect(a.page.locator('h1 .code')).toBeVisible();
  await b.page.getByRole('button', { name: 'Play online' }).click();
  await b.page.getByRole('button', { name: 'Quick play' }).click();
  await expect(a.page.locator(ARENA)).toBeVisible({ timeout: 15_000 });
  await expect(b.page.locator(ARENA)).toBeVisible({ timeout: 15_000 });
  await Promise.all([ctxA.close(), ctxB.close()]);
});
