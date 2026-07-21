// Harness isolado da replicação crítica (Fable).
// Extensão .check.ts/.check.tsx de propósito: npm test (produção) não coleta.
// Executar: npx vitest run --config replication-oracle/vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['replication-oracle/checks/**/*.check.{ts,tsx}'],
  },
})
