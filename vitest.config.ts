import { defineConfig } from 'vitest/config';
export default defineConfig({
 test: { include: ['tests/**/*.test.{ts,tsx}'], environment: 'node',
 environmentMatchGlobs: [['tests/ui/**', 'jsdom']], maxWorkers: 1 }
});

