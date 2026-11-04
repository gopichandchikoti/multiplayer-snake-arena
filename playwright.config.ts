import { defineConfig, devices } from '@playwright/test';

/** E2E runs the production bundle in production mode on its own port, so it never touches a dev server. */
const PORT = 5730;

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results/e2e',
  timeout: 90_000,
  expect: { timeout: 12_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: `http://127.0.0.1:${String(PORT)}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node apps/server/dist/main.mjs',
    url: `http://127.0.0.1:${String(PORT)}/readyz`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: { PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'production', ROUND_TICKS: '150', LOG_LEVEL: 'warn' },
  },
  projects: [
    {
      name: 'desktop',
      testIgnore: /mobile\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    { name: 'mobile', testMatch: /mobile\.spec\.ts/, use: { ...devices['Pixel 5'] } },
  ],
});
