# Identidade longitudinal por scoringVersion

## Decisão

A unidade de comparabilidade matemática é a tupla:

```text
(testId, protocolVersion, normalizedScoringVersion)
```

`getLongitudinalSeriesKey(session)` é a fonte central dessa identidade. A
chave usa a serialização JSON da tupla, evitando concatenações manuais e
colisões por delimitadores presentes em strings compostas.

`normalizedScoringVersion` remove apenas espaços externos. Resultado ausente,
campo ausente, string vazia, apenas espaços ou tipo inesperado em dado
histórico são classificados como `legacy-unversioned`. Essa classificação é
estável e nunca é promovida automaticamente para a regra atual.

## Onde a identidade é obrigatória

- contagem de familiarização e fase da nova sessão;
- baseline geral e sua janela 4–11;
- referências contextuais e seus progressos;
- verificação defensiva antes do z-score;
- séries e tooltips dos gráficos longitudinais;
- contagens e avisos sobre sessões comparáveis.

Listagens puramente históricas não são filtradas por essa identidade. Os
registros antigos continuam visíveis.

## Comportamento do gráfico

O gráfico mostra uma sórie compatível por vez. Na tela do teste, é a série da
regra atual declarada pela definição do teste. No histórico, é a série da
sessão válida mais recente. Pontos de scoring diferente nunca compartilham a
mesma linha. A interface informa quantas sessões de outro scoring foram
preservadas fora da série, e o tooltip informa a versão de scoring sem expor o
`sessionId`.

## Corsi e dados existentes

- `sdt-hautus-1` permanece na série legacy versionada;
- `sdt-hautus-1;corsi-replay-1` forma a série current;
- uma sessão current não usa as legacy para familiarização, baseline ou z;
- no cenário anonimizado de 6 legacy + 1 current, a current está na primeira
  familiarização, o gráfico tem somente seu ponto na série current e avisa
  sobre as 6 sessões históricas preservadas.

## Limites desta mudança

Não há migração, rescore, inferência por data ou escrita em sessões
existentes. `trials`, valores persistidos, `protocolVersion`, `scoringVersion`,
importação/exportação e backup não são transformados. AG-03 permanece fora
do escopo.
