import type { BrowserContext, ConsoleMessage, Page } from '@playwright/test';

/** Chromium's headless software GPU prints this performance note while Phaser builds its textures. */
const KNOWN_NOISE = [/GPU stall due to ReadPixels/];

export interface Problems {
  list: string[];
}

/** Collects console errors, page errors, CSP violations and failed requests for a page. */
export function watchProblems(page: Page): Problems {
  const problems: Problems = { list: [] };
  const record = (text: string): void => {
    if (!KNOWN_NOISE.some((rx) => rx.test(text))) problems.list.push(text);
  };
  page.on('console', (m: ConsoleMessage) => {
    if (m.type() === 'error' || m.type() === 'warning') record(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => {
    record(`pageerror: ${e.message}`);
  });
  page.on('requestfailed', (r) => {
    record(`requestfailed: ${r.url()} ${r.failure()?.errorText ?? ''}`);
  });
  return problems;
}

export async function newPlayer(context: BrowserContext, name: string): Promise<{ page: Page; problems: Problems }> {
  const page = await context.newPage();
  const problems = watchProblems(page);
  await page.goto('/');
  await page.getByLabel('Your name').fill(name);
  return { page, problems };
}

export async function openOnlineMenu(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Play online' }).click();
  await page.getByRole('heading', { name: 'Play online' }).waitFor();
}

export async function createRoom(page: Page): Promise<string> {
  await openOnlineMenu(page);
  await page.getByRole('button', { name: 'Create room' }).click();
  const code = page.locator('h1 .code');
  await code.waitFor();
  return (await code.textContent())?.trim() ?? '';
}

export async function joinRoom(page: Page, code: string, watch = false): Promise<void> {
  await openOnlineMenu(page);
  await page.getByLabel('Room code').fill(code);
  await page.getByRole('button', { name: watch ? 'Watch' : 'Join', exact: true }).click();
  await page.locator('h1 .code').waitFor();
}

export const ARENA = '.arena';

/**
 * A rough "is something drawn" check: a blank canvas compresses to 1-3 KB, while the drawn
 * checker board alone is well over 10 KB.
 */
export async function arenaLooksDrawn(page: Page): Promise<boolean> {
  const png = await page.locator(ARENA).screenshot();
  return png.length > 10_000;
}
