# Apresentação de métricas

`src/metrics/presentation.ts` é a fonte única de verdade para rótulo, unidade, escala, precisão, ausência e sinal das métricas exibidas pelo Cognitive Lab.

- Tempos usam `ms` somente quando cadastrados explicitamente como temporais.
- Proporções persistidas entre 0 e 1 são escaladas apenas na apresentação e exibidas em `%`.
- Diferenças de precisão são exibidas em pontos percentuais (`pp`) e preservam o sinal.
- d-prime e criterion são adimensionais; spans e contagens permanecem sem unidade.
- `null`, `undefined` e valores não finitos são exibidos como `Indisponível`.
- Métricas desconhecidas usam o fallback neutro, sem unidade inferida pelo nome.

Ao adicionar uma métrica exibida na interface, inclua sua chave em `METRIC_PRESENTATIONS` e cubra o formato em teste. O registry altera somente a apresentação: valores persistidos, fórmulas, scoring e versões de protocolo não são transformados.
