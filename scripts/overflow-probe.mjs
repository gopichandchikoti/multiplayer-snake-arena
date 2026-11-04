// Lists elements that stick out of the viewport horizontally.
// Usage: node scripts/overflow-probe.mjs [url] [rootFontPercent] [button,names,to,click]
import { chromium } from '@playwright/test';

const url = process.argv[2] ?? 'http://127.0.0.1:5730/';
const percent = process.argv[3] ?? '200';
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 320, height: 640 } })).newPage();
await page.goto(url);
await page.evaluate((p) => {
  document.documentElement.style.fontSize = `${p}%`;
}, percent);
const steps = (process.argv[4] ?? '').split(',').filter(Boolean);
for (const name of steps) {
  await page.getByRole('button', { name }).click();
  await page.waitForTimeout(400);
}
const offenders = await page.evaluate(() =>
  [...document.querySelectorAll('body *')]
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 0 && r.right > window.innerWidth + 1)
    .map(
      ({ el, r }) =>
        `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} right=${Math.round(r.right)} w=${Math.round(r.width)} "${(el.textContent ?? '').slice(0, 30)}"`,
    )
    .slice(0, 12),
);
process.stdout.write(`${offenders.join('\n') || 'no offenders'}\n`);
await browser.close();
