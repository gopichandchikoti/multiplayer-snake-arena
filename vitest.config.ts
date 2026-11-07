import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/shared', 'apps/server', 'apps/client'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
      // Globs are matched per project root, so they start at `src`.
      include: ['**/src/**/*.{ts,tsx}'],
      // Rendering code needs a real GPU/canvas; it is exercised by the Playwright suite instead.
      // See docs/ARCHITECTURE.md#testing-and-development-workflow for coverage exclusions.
      exclude: ['**/render/**', '**/main.ts', '**/main.tsx', '**/*.d.ts'],
      thresholds: { lines: 90, statements: 90, branches: 90, functions: 90 },
    },
  },
});
