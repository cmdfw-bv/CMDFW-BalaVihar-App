import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      // react-native/expo-secure-store's real sources need Metro/Babel (Flow syntax, native
      // bindings) that vitest's Node/Vite pipeline can't parse. Pure-logic tests never exercise
      // the native runtime — platform-branched wiring is verified by hand at /build instead.
      'react-native': fileURLToPath(new URL('./test/mocks/react-native.ts', import.meta.url)),
      'expo-secure-store': fileURLToPath(new URL('./test/mocks/expo-secure-store.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: [
      'netlify/functions/__tests__/**/*.test.ts',
      '.claude/hooks/__tests__/**/*.test.ts',
      'scripts/__tests__/**/*.test.ts',
      'lib/**/__tests__/**/*.test.ts',
      'components/**/__tests__/**/*.test.ts',
    ],
  },
});
