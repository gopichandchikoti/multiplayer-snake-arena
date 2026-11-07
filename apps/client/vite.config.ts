import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Only used by standalone `pnpm dev`. Vercel owns /api and /ws routing in services mode.
const SERVER = process.env.SNAKE_SERVER ?? 'http://127.0.0.1:5722';
const vercelDev = process.env.VERCEL === '1';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: Number(process.env.PORT ?? 5720),
    strictPort: true,
    proxy: vercelDev
      ? undefined
      : {
          '/ws': { target: SERVER.replace('http', 'ws'), ws: true },
          '/api': SERVER,
          '/healthz': SERVER,
          '/readyz': SERVER,
        },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 1800,
  },
  test: {
    name: 'client',
    include: ['test/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['test/setup.ts'],
  },
});
