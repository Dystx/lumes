import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    exclude: ['node_modules', 'dist', 'tests/perf/**/*'],
    testTimeout: 30000,
  },
});
