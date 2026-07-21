// Config isolada do harness de comparação da auditoria.
// Usa a extensão .check.ts DE PROPÓSITO: o vitest de produção (npm test) só
// coleta *.test.ts/*.spec.ts, então a suíte de produção permanece intocada.
// Executar: npx vitest run --config validation-oracle/vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['validation-oracle/comparisons/**/*.check.ts'],
  },
})
