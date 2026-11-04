import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { createRoom, watchProblems } from './helpers';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function scan(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
  expect(summary, label).toEqual([]);
}

for (const scheme of ['light', 'dark'] as const) {
  test(`accessibility: no axe violations on the main screens (${scheme} scheme)`, async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: scheme });
    const page = await context.newPage();
    await page.goto('/');
    await scan(page, 'menu');
    await page.getByRole('button', { name: 'Settings' }).click();
    await scan(page, 'settings dialog');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'How to play' }).click();
    await scan(page, 'help dialog');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Practice against bots' }).click();
    await scan(page, 'practice setup');
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByRole('button', { name: 'Play online' }).click();
    await scan(page, 'online menu');
    await page.getByRole('button', { name: 'Leaderboard' }).click();
    await scan(page, 'leaderboard');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Create room' }).click();
    await page.locator('h1 .code').waitFor();
    await scan(page, 'lobby');
    await context.close();
  });
}

test('accessibility: the whole practice flow works with the keyboard alone', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Your name')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Play online' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Practice against bots' })).toBeFocused();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Start practice' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Get ready to steer')).toBeVisible();
  await page.waitForTimeout(3600);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('timer')).toBeVisible();
  await expect(page.getByRole('status').first()).toBeAttached();
});

test('accessibility: dialogs trap focus, close with Escape and return focus', async ({ page }) => {
  await page.goto('/');
  const opener = page.getByRole('button', { name: 'Settings' });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test('accessibility: reduced motion removes animation and the setting is honoured', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Practice against bots' }).click();
  await page.getByRole('button', { name: 'Start practice' }).click();
  const duration = await page.locator('.overlay__count').evaluate((el) => getComputedStyle(el).animationDuration);
  expect(Number.parseFloat(duration)).toBeLessThan(0.01);
  await context.close();
});

test('accessibility: the layout survives 200% text size at a narrow width', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 640 } });
  const page = await context.newPage();
  await page.goto('/');
  // The page's own CSP forbids injected stylesheets, so change the root size through the style object.
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(page.getByRole('button', { name: 'Practice against bots' })).toBeVisible();
  for (const open of ['Play online', 'Create room']) {
    await page.getByRole('button', { name: open }).click();
    await page.waitForTimeout(250);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
      open,
    ).toBeLessThanOrEqual(1);
  }
  await context.close();
});

test('security: strict headers, no framing, and markup in names is only ever text', async ({ page, request }) => {
  const response = await request.get('/');
  const headers = response.headers();
  expect(headers['content-security-policy']).toContain("script-src 'self'");
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['referrer-policy']).toBe('no-referrer');

  const problems = watchProblems(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, '__xss', { value: 0, writable: true });
  });
  await page.goto('/?room=<img src=x onerror=window.__xss=1>');
  await page.getByLabel('Your name').fill('<img src=x onerror=window.__xss=1>');
  await createRoom(page);
  await expect(page.getByRole('list', { name: /Players/ })).toContainText('img srcx onerr');
  const xss = await page.evaluate((): unknown => {
    const value: unknown = Reflect.get(window, '__xss');
    return value;
  });
  expect(xss).toBe(0);
  expect(await page.locator('img[src="x"]').count()).toBe(0);
  expect(problems.list).toEqual([]);
});

test('security: a page on another origin cannot open a game socket, and unknown paths are 404', async ({
  page,
  request,
}) => {
  const host = new URL(page.url() === 'about:blank' ? 'http://127.0.0.1:5730' : page.url()).host;
  await page.goto('http://localhost:5730/');
  const outcome = await page.evaluate(
    (target) =>
      new Promise<string>((resolve) => {
        const ws = new WebSocket(`ws://${target}/ws`);
        ws.onopen = () => resolve('open');
        ws.onerror = () => resolve('refused');
      }),
    host,
  );
  expect(outcome).toBe('refused');
  expect((await request.get('/api/does-not-exist')).status()).toBe(404);
  expect((await request.post('/api/leaderboard', { data: {} })).status()).toBe(405);
});
