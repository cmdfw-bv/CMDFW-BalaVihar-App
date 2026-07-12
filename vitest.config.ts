import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['netlify/functions/__tests__/**/*.test.ts', '.claude/hooks/__tests__/**/*.test.ts', 'scripts/__tests__/**/*.test.ts'],
  },
});
