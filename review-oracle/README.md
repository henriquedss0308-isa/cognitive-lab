# review-oracle

Harness adversarial isolado para a revisão GPT-5.6. Não importa nenhum módulo de
`validation-oracle/` e não grava arquivos durante a execução.

Executar a partir da raiz:

```powershell
npx vitest run --config review-oracle/vitest.config.ts
```

Escopo: fixtures de AC-01 e AC-02, apresentação de AC-12, compatibilidade
histórica do Corsi, partição SDT em antecipações e robustez da importação.
