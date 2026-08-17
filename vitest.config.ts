import { defineConfig } from 'vitest/config'

// Kept separate from vite.config.ts so the app build stays free of test config.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
