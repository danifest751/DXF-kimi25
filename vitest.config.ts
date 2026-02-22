import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'tests/fixtures'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'tests/fixtures/', '**/*.d.ts', '**/*.test.ts'],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 80,
        statements: 85,
      },
    },
  },
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, 'packages/core-engine/src'),
      '@tests': path.resolve(__dirname, 'tests'),
    },
  },
});
