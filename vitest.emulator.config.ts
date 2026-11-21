import { defineConfig } from 'vitest/config';

// Runs inside `firebase emulators:exec` (see `npm run test:emulator`), which sets FIRESTORE_EMULATOR_HOST.
export default defineConfig({
  test: {
    include: ['src/tests/emulator/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      FIREBASE_PROJECT_ID: 'demo-calm-flames',
    },
    fileParallelism: false,
    testTimeout: 20000,
  },
});
