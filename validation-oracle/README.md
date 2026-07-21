# validation-oracle

Implementação-oráculo independente para a auditoria científica do Cognitive Lab
(tag `v1.2.0-pre-validation`, commit `05ef727b4826ea92193ec0e2add40cd662eb1906`).

## Princípios

- **Independência**: o oráculo NÃO importa nenhuma função de scoring do código de
  produção. Parte das definições matemáticas e metodológicas (documentadas em
  cada módulo) e as implementa do zero em Python.
- **Determinismo**: fixtures geradas com seed fixa (`make_fixtures.py`), sem
  qualquer fonte de aleatoriedade não semeada.
- **Sem dependências externas**: apenas a biblioteca padrão do Python (≥ 3.8;
  usa `statistics.NormalDist.inv_cdf` para a normal inversa, com precisão
  muito superior à aproximação de Acklam usada em produção).

## Estrutura

```
validation-oracle/
  README.md
  requirements.txt        # vazio de propósito — stdlib apenas
  oracle/                 # implementação independente
    stats.py              # mediana, média, DP, percentil, IQR, MAD, CV, z robusto
    sdt.py                # d', critério, correção log-linear de Hautus (1995)
    rt.py                 # limpeza de RT, métricas de RT, métricas de acurácia
    costs.py              # custos Stroop / switch / mixing
    corsi.py              # replay das regras adaptativas do Corsi (spec §13)
    baseline.py           # fases, janela congelada, janelas contextuais, z primário
    selftest.py           # casos calculados à mão + casos de fronteira
  fixtures/               # JSON determinístico (gerado por make_fixtures.py)
  comparisons/            # harness que executa o CÓDIGO REAL e compara
    expected/             # saídas do oráculo (JSON)
    oracle_vs_production.test.ts
  reports/                # resultados da comparação
  make_fixtures.py        # gera fixtures + expected (seed fixa)
```

## Como executar

```bash
# 1. Auto-teste do oráculo (casos manuais + fronteiras)
python -m oracle.selftest          # executar de dentro de validation-oracle/

# 2. Regenerar fixtures e valores esperados (determinístico, seed fixa)
python make_fixtures.py            # de dentro de validation-oracle/

# 3. Comparar oráculo × código de produção
npx vitest run validation-oracle/comparisons --pool=threads
```

O passo 3 usa o vitest já presente no repositório apenas como executor de
TypeScript; nenhuma configuração de produção foi alterada. O teste de
comparação importa as funções REAIS de `src/` e compara os números com os
valores pré-computados pelo oráculo em `comparisons/expected/`.

## Tolerâncias

- Estatísticas descritivas e custos: igualdade até `1e-9` (mesma aritmética IEEE-754).
- d′ e critério: `5e-4` — a produção usa a aproximação de Acklam para a normal
  inversa (erro documentado ~1.15e-9 na região central, maior nas caudas);
  o oráculo usa `NormalDist.inv_cdf` (precisão de máquina). Divergências acima
  de 5e-4 seriam achado real; abaixo, diferença de aproximação numérica.
