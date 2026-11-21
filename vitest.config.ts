import { defineConfig } from 'vitest/config';

// Unit / route tests. Firestore is disabled (fails fast) so nothing touches live Firebase.
// Emulator-backed tests live in src/tests/emulator and run via `npm run test:emulator`.
export default defineConfig({
  test: {
    include: ['src/tests/**/*.test.ts'],
    exclude: ['src/tests/emulator/**', 'node_modules/**'],
    env: {
      NODE_ENV: 'test',
      FIRESTORE_DISABLED: '1',
    },
    testTimeout: 10000,
  },
});
