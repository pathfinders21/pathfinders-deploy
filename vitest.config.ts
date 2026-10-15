import { defineConfig } from 'vitest/config'

/**
 * Tests cover the Worker's pure and D1-backed logic. They run in Node with a
 * small in-memory D1 stand-in, which is deliberate: the goal is to pin the
 * *rules* (validation, limits, retries, isolation), not to pretend a Node
 * process is workerd. Runtime behaviour is verified separately against
 * `wrangler dev`.
 */
export default defineConfig({
  test: {
    include: ['worker/**/*.test.ts', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
  },
})
