import { expect, test } from '@playwright/test';
import { ARENA, arenaLooksDrawn, watchProblems } from './helpers';

test('mobile: menu fits the screen and the practice board turns upright for a tall screen', async ({ page }) => {
  const problems = watchProblems(page);
  await page.goto('/');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: 'docs/screenshots/e2e-mobile-menu.png' });
  await page.getByRole('button', { name: 'Practice against bots' }).tap();
  await page.getByRole('button', { name: 'Start practice' }).tap();
  await page.waitForTimeout(4500);
  await expect(page.getByRole('group', { name: 'Steering pad' })).toBeVisible();
  expect(await arenaLooksDrawn(page)).toBe(true);
  const box = await page.locator(ARENA).boundingBox();
  expect(box && box.height > box.width).toBe(true);
  const pad = await page.getByRole('button', { name: 'Turn left' }).boundingBox();
  expect(pad && pad.width >= 44 && pad.height >= 44).toBe(true);
  await page.getByRole('button', { name: 'Turn left' }).tap();
  await page.getByRole('button', { name: 'Turn down' }).tap();
  await page.screenshot({ path: 'docs/screenshots/e2e-mobile-game.png' });
  const gameOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(gameOverflow).toBeLessThanOrEqual(1);
  expect(problems.list).toEqual([]);
});

test('mobile: swiping on the arena steers, and a swipe does not scroll the page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Practice against bots' }).tap();
  await page.getByRole('button', { name: 'Start practice' }).tap();
  await page.waitForTimeout(4000);
  const arena = page.locator(ARENA);
  const box = await arena.boundingBox();
  if (!box) throw new Error('no arena');
  const client = await page.context().newCDPSession(page);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 80, y }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.getByRole('timer')).toBeVisible();
});

test('mobile: the lobby and online menu fit a phone', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Play online' }).tap();
  await page.getByRole('heading', { name: 'Play online' }).waitFor();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: 'docs/screenshots/e2e-mobile-online-menu.png', fullPage: true });
  await page.getByRole('button', { name: 'Create room' }).tap();
  await page.locator('h1 .code').waitFor();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: 'docs/screenshots/e2e-mobile-lobby.png', fullPage: true });
});

test('mobile: a very small screen (320 px) still works', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await page.getByRole('button', { name: 'Practice against bots' }).tap();
  await page.getByRole('button', { name: 'Start practice' }).tap();
  await page.waitForTimeout(4200);
  expect(await arenaLooksDrawn(page)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: 'docs/screenshots/e2e-320-game.png' });
  await context.close();
});
