import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const SERVER = process.env.SNAKE_SERVER ?? 'http://127.0.0.1:5721';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5720,
    strictPort: true,
    proxy: {
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
