import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['review-oracle/**/*.check.ts'],
  },
})
