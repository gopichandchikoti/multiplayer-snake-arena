// Takes screenshots of the main screens for docs and visual checks.
// Usage: node scripts/shoot.mjs [baseUrl] [outDir]
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://127.0.0.1:5720';
const out = process.argv[3] ?? 'docs/screenshots';
await mkdir(out, { recursive: true });

const browser = await chromium.launch();
const consoleProblems = [];

async function shoot(name, viewport, steps) {
  const context = await browser.newContext({ viewport, hasTouch: viewport.width < 600, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('console', (m) => {
    if (['error', 'warning'].includes(m.type())) consoleProblems.push(`${name}: [${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => {
    const stack = String(e.stack ?? '')
      .split(/\r?\n/)
      .slice(0, 6)
      .join(' | ');
    consoleProblems.push(`${name}: pageerror ${e.message} :: ${stack}`);
  });
  await page.goto(base);
  await steps(page);
  await page.screenshot({ path: `${out}/${name}.png` });
  await context.close();
}

const startPractice = async (page) => {
  await page.getByRole('button', { name: 'Practice against bots' }).click();
  await page.getByRole('button', { name: 'Start practice' }).click();
};

await shoot('menu-desktop', { width: 1280, height: 800 }, async () => {});
await shoot('menu-mobile', { width: 360, height: 740 }, async () => {});
await shoot('setup-desktop', { width: 1280, height: 800 }, (p) =>
  p.getByRole('button', { name: 'Practice against bots' }).click(),
);
await shoot('game-desktop', { width: 1280, height: 800 }, async (page) => {
  await startPractice(page);
  await page.waitForTimeout(6500);
});
await shoot('game-mobile', { width: 360, height: 740 }, async (page) => {
  await startPractice(page);
  await page.waitForTimeout(6500);
});

await browser.close();
console.log(
  consoleProblems.length ? `Console problems:\n${consoleProblems.join('\n')}` : 'No console errors or warnings.',
);
