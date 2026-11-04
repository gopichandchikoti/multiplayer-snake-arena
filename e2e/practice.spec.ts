import { expect, test } from '@playwright/test';
import { ARENA, arenaLooksDrawn, watchProblems } from './helpers';

test('practice: from the menu to a finished round, with a drawn board and no console problems', async ({ page }) => {
  const problems = watchProblems(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Eight snakes. One board.');
  await page.getByLabel('Your name').fill('Tester');
  await page.getByRole('button', { name: 'Practice against bots' }).click();
  await page.getByRole('button', { name: 'Start practice' }).click();

  await expect(page.getByText('Get ready to steer')).toBeVisible();
  await expect(page.getByRole('timer')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Scoreboard' })).toContainText('Tester (you)');
  await page.waitForTimeout(4500);
  expect(await arenaLooksDrawn(page)).toBe(true);
  await page.screenshot({ path: 'docs/screenshots/e2e-practice-game.png' });

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('KeyD');
  await page.keyboard.press('KeyP');
  await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible();
  await page.getByRole('button', { name: 'Resume' }).last().click();
  await expect(page.getByRole('heading', { name: 'Paused' })).toBeHidden();

  // The player steers into a wall or a bot sooner or later: the round must end with a summary.
  await expect(page.locator('#summary-title')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('list', { name: 'Final standings' })).toBeVisible();
  await expect(page.getByText('Offline practice · not ranked')).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/e2e-practice-summary.png' });
  await page.getByRole('button', { name: 'Play again' }).click();
  await expect(page.locator(ARENA)).toBeVisible();
  expect(problems.list).toEqual([]);
});

test('practice: records are kept on this device and shown in Settings', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Practice against bots' }).click();
  await page.getByRole('button', { name: 'Start practice' }).click();
  await expect(page.locator('#summary-title')).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Main menu' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByText('Practice: 1 rounds')).toBeVisible();
});
