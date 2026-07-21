# replication-oracle

Harness da **replicação crítica independente (Fable)** de três achados
prioritários da revisão adversarial GPT-5.6, mais a verificação curta de AC-02.

Produção replicada: `v1.2.0-pre-validation` = `05ef727b4826ea92193ec0e2add40cd662eb1906`.
Relatório: [`docs/REPLICACAO_CRITICA_FABLE.md`](../docs/REPLICACAO_CRITICA_FABLE.md).

## Executar

```bash
npx vitest run --config replication-oracle/vitest.config.ts
```

48 checks em 4 arquivos. A extensão `.check.ts(x)` é deliberada: `npm test`
(produção) coleta apenas `*.test.ts`/`*.spec.ts` e **não** vê estes arquivos.

## Conteúdo

| Arquivo | Alvo |
|---|---|
| `checks/ag01_corsi_history.check.ts` | AG-01 — scorer Corsi legado **real** × atual × engine; mistura longitudinal em baseline, z e gráfico |
| `checks/ag03_sdt_anticipations.check.ts` | AG-03 — antecipações pré/pós-onset na tabela SDT de Go/No-Go, SART e n-back |
| `checks/ac12_rendering.check.tsx` | AC-12 — renderização real do `MetricCard` (DOM), unidade, escala, arredondamento e bordas |
| `checks/ac02_fallback_scope.check.ts` | AC-02 — alcance real do fallback de métrica primária |

## `legacy/mirror/` — por que existe

A revisão do GPT-5.6 **reimplementou** o scorer Corsi antigo a partir da leitura
do commit. Um teste assim confirma a leitura, não o código. Aqui o artefato
histórico é executado de verdade:

```bash
git rev-parse 478a8fb^:src/tests/corsi/index.ts
# 8d8a030bf149cf14f1930c04a25c808563b55ad1
```

`legacy/mirror/tests/corsi/index.ts` é esse blob, byte-idêntico (confirmável com
`git hash-object`). Os demais arquivos de `legacy/mirror/` são **shims de
resolução**: reexportam tipos e `buildBaseResult` da produção atual para que o
blob compile sem ser modificado. Isso é seguro para o objeto auditado — apenas
`customMetrics` do Corsi são comparadas, e a assinatura de `buildBaseResult` foi
verificada como inalterada no diff de `478a8fb`.

## Independência — limites declarados

Os valores esperados são asserções inline derivadas das mesmas definições que a
produção implementa; não há proveniência externa. A mitigação adotada foi
diferente da do `validation-oracle/`: executar o artefato histórico real e o
componente de UI real, em vez de descrevê-los. As limitações remanescentes estão
na §6 do relatório.

Nenhum arquivo de produção é modificado. Nenhum dado pessoal ou backup real é
usado — todas as fixtures são sintéticas e inline.
