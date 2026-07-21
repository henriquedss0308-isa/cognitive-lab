# Revisão adversarial independente — GPT-5.6

Data: 2026-07-21

Produção congelada: `v1.2.0-pre-validation`

Commit auditado: `05ef727b4826ea92193ec0e2add40cd662eb1906`

Branch de trabalho: `review/adversarial-gpt56-v1`

## Veredito executivo

A conclusão anterior — “internamente correto, reproduzível e defensável como
instrumento pessoal longitudinal” — **não está demonstrada**. A auditoria
anterior fez trabalho útil sobre aritmética selecionada, mas transformou
concordância computacional parcial em conclusão científica ampla.

A revisão confirmou 13 dos 20 AC, contando cinco com ressalvas, reclassificou
quatro, refutou um e deixou dois dependentes de experimento físico. Encontrou
quatro achados adicionais. O mais grave, **AG-01 P0**, é uma fronteira histórica
de scoring Corsi que não separa baseline nem gráfico: o mesmo replay pode valer
1 na regra antiga e 2 na atual sob a mesma `protocolVersion`. **AG-03 P1** mostra
que antecipações pré-onset entram de forma assimétrica na tabela SDT e alteram
d′ em sessão ainda classificada como válida.

AC-01 não produz hoje a inversão decisória P1 alegada: é incoerência de
convenção/rótulo/metadado em métrica secundária, revisada para P2. AC-02 é P1,
mas seu caminho padrão alcança Stroop e Task Switching, não os seis testes.
AC-12 foi subestimado: a interface normal mostra, por exemplo, proporção SART
como `0.11 ms` e d′ arredondado como inteiro com unidade `ms`; por estar no
cartão principal, foi elevado a P1.

## Escopo e regra de independência

Foram tratados como objetos suspeitos:

- os quatro documentos científicos anteriores;
- `validation-oracle/`, seus expected, fixtures, tolerâncias e harness;
- os 20 achados AC;
- o histórico Git relevante a scoring, protocolo e migrações;
- código de geração, engine, scoring, apresentação, baseline, gráfico e import.

Não foram alterados produção, documentos anteriores ou oráculo anterior. Não
foi usado backup real nem dado pessoal. O único código novo está isolado em
[`review-oracle/`](../review-oracle/), sem importação de
`validation-oracle/oracle/` e sem escrita durante os testes. A implementação de
referência do review não importa produção; o arquivo de checks importa produção
somente como objeto observado.

## Estado do repositório e reprodução

Antes da análise:

- branch confirmada: `review/adversarial-gpt56-v1`;
- working tree limpo;
- tag e hash explícito resolveram para
  `05ef727b4826ea92193ec0e2add40cd662eb1906`;
- o diff entre a tag e o HEAD anterior à revisão continha apenas artefatos do
  auditor; nenhum arquivo protegido de produção diferia da versão congelada.

Resultados executados nesta revisão:

| Comando | Resultado |
|---|---|
| `npm test -- --reporter=dot` | **49 arquivos, 754/754 testes passaram**; stderr esperado de testes de falha/estado; 99,32 s |
| `npx tsc -b` | passou, sem diagnóstico |
| `npm run lint` | passou com **4 warnings**: três optional chaining em testes Corsi e um fast-refresh em `AppContext` |
| `npm run build` | passou; 899 módulos; JS principal 844,08 kB; aviso de chunk >500 kB |
| `python -m oracle.selftest` em `validation-oracle/` | passou, 0 falhas |
| `npx vitest run --config validation-oracle/vitest.config.ts --reporter=verbose` | **40/40 passaram** |
| `npx vitest run --config review-oracle/vitest.config.ts --reporter=verbose` | **18/18 passaram** |

O check anterior grava um timestamp em `comparison_report.json`; o arquivo foi
restaurado ao blob versionado depois da execução. Aprovação desses comandos é
evidência de regressão/reprodução computacional, não de validade metodológica.

## Ataque ao oráculo anterior

### O que é realmente independente

- Os módulos Python não importam `src/`; usam apenas a biblioteca padrão.
- O harness TypeScript executa funções reais de produção para estatística
  básica, SDT, RT, custos, Corsi, baseline e três `scoreSession` completos.
- Seed fixa, JSON versionado e self-tests permitem repetição determinística.
- A implementação de `NormalDist.inv_cdf` é uma escolha numericamente distinta
  da aproximação de Acklam em produção.

Isso torna o artefato útil como **cross-check matemático/regressivo**.

### Onde a independência é fraca

1. `make_fixtures.py` gera **fixtures e expected no mesmo processo**, usando o
   próprio oráculo. Portanto os JSON expected não validam o oráculo; só congelam
   sua saída. Os casos manuais de `selftest.py` reduzem, mas não eliminam, esse
   círculo.
2. O replay Corsi Python é uma tradução muito próxima das mesmas regras,
   estados, constantes e ordem do TypeScript. Não importa código, mas a
   independência epistemológica é fraca: um erro compartilhado na especificação
   passa em ambos.
3. Oráculo, gerador, fixtures e expected entraram juntos no commit `c1cbbb7`.
   Não há proveniência externa, preregistro ou hash anterior que demonstre que
   expected não foi regenerado depois de observar produção.
4. “40 checks” não significa 40 caminhos científicos. Dez são arrays de
   estatística básica, oito são tabelas SDT e seis são cenários de baseline. O
   score completo só cobre Go/No-Go, Stroop e Task Switching; SART, n-back e
   Corsi não percorrem o mesmo caminho de apresentação usado pela interface.
5. O harness não executa o fallback de `Results`, formatação do cartão, guarda
   de qualidade, importação ou compatibilidade histórica. Assim, passou ao lado
   de AC-02, AC-12 e AG-01/03/04.
6. A fixture de RT contém uma antecipação Go sem resposta, mas o expected é
   calculado com a mesma definição e não verifica a identidade exaustiva
   `H+M=N_sinal`; por isso favorece concordância no erro de AG-03.
7. A tolerância SDT `5e-4` é muito maior que o erro central anunciado para
   Acklam. Ela poderia ocultar divergência de até 0,0005, embora isso seja
   materialmente pequeno para esta aplicação. Não explica os achados de maior
   severidade.
8. O relatório final registra somente as duas chamadas a `note`, não cada match;
   a contagem 40 vem do runner. O JSON não é uma matriz de cobertura.

### Veredito sobre o oráculo

**Parcialmente independente e correto para os casos exercitados; insuficiente
para sustentar a conclusão global.** Ele demonstra concordância de fórmulas
selecionadas com uma segunda implementação, não validade do protocolo, da UI,
do histórico, do timing físico ou da inferência longitudinal.

## Revisão profunda de AC-01

### Mecanismo executado

Produção define:

```text
mixingCostAccuracy = accuracy(mixed_repeat) − mean(accuracy(pure_odd_even), accuracy(pure_magnitude))
```

Os testes adversariais observaram exatamente:

| Pure | Mixed repeat | Produção | Custo positivo = pior (`pure − repeat`) |
|---:|---:|---:|---:|
| 1,00 | 0,50 | −0,50 | +0,50 |
| 0,50 | 1,00 | +0,50 | −0,50 |
| 0,50 | 0,50 | 0 | 0 |
| 1,00 | 0,00 (n=1) | −1,00 | +1,00 |

Sem RT válido em `mixed_repeat`, a condição mantém acurácia e a métrica fica
definida; isso é coerente por se tratar de precisão.

### Onde o auditor acertou e errou

Ele acertou que o nome “cost”, a orientação usada em `switchCostAccuracy` e
`metricDirections.mixingCostAccuracy = -1` não formam um contrato coerente. A
literatura frequentemente expressa custo como aumento de erro ou perda de
acurácia, mas não impõe uma orientação universal quando a variável publicada é
uma diferença de acurácia; o contraste precisa ser declarado.

Ele errou no impacto. `metricDirection` só é aplicado em `evaluatePrimaryZ`, e
`mixingCostAccuracy` não é `primaryMetricKey`, não entra em
`baselineMetricKeys` e não dirige z nem decisão. A tela mostra o valor secundário
cru. Logo, a hipótese “melhora aparece como piora” não ocorre hoje no caminho
alegado.

**Veredito: RECLASSIFICADO, P2, confiança alta.** O problema atual é
semântico/metadado, não inversão de conclusão. A menor correção seria direção
`+1` e rótulo “diferença de precisão (mista−pura)”; se o produto quiser custo
positivo = pior, deve inverter o número, manter direção `-1` e criar nova
`scoringVersion`. Não exige `protocolVersion` nem baseline no estado atual.

## Revisão profunda de AC-02

### Caminho executado

[`Results.tsx`](../src/pages/Results.tsx) faz:

```text
displayedPrimary = customMetrics[primaryMetricKey] ?? medianCorrectRT
z = evaluatePrimaryZ(displayedPrimary, baseline, test)
```

O baseline continua buscando `test.primaryMetricKey`; portanto um RT pode ser
normalizado contra distribuição de custo/d′/taxa/span.

| Teste padrão degenerado | Primária pode ser `null` mantendo RT? | Qualidade do caso | Fallback/z falso observado? |
|---|---|---|---|
| Stroop | Sim, se congruente ou incongruente não tiver RT correto, mas houver RT em outras condições | `valid` no fixture | **Sim**: cartão 500 ms e `|z| > 10` contra baseline da primária |
| Task Switching | Sim, se switch ou repeat não tiver RT correto, mas pure/outra condição tiver | `valid` no fixture | **Sim**, mesmo mecanismo |
| Go/No-Go | Não no gerador padrão; Hautus e ambas as classes tornam d′ finito | `valid` | Não |
| SART | Não; a proporção de comissão tem denominador No-Go não vazio | `valid` | Não |
| N-back | Não no gerador padrão; 2-back tem alvo e não alvo e Hautus retorna d′ finito | `valid` | Não |
| Corsi | Não; `confirmedSpan` é número, inclusive 0 | `valid` | Não; `??` preserva 0 |

Uma importação com `result` incompleto pode tornar a chave ausente em mais
testes, mas isso é AG-04 e não amplia legitimamente o scoring padrão.

**Veredito: RECLASSIFICADO quanto ao escopo, P1 mantido, confiança alta.** É
um caminho normal/plausível para dois testes e produz z dimensionalmente falso;
não é P0 porque depende de subconjunto condicional extremo e não corrompe o
valor persistido. A correção correta é null-safe: mostrar ausência e não
calcular z. Não requer nova versão nem reconstrução de baseline.

## P0/P1 perdidos

### AG-01 — P0: Corsi histórico mistura regras de scoring

O commit `478a8fb` registra que o scorer anterior exigia dois acertos
consecutivos para confirmar span e podia encerrar após dois erros totais, em
divergência com o engine. A correção adicionou
`sdt-hautus-1;corsi-replay-1`, mas manteve `corsi.forward.v1.0` e declarou
sessões antigas “congeladas”.

O congelamento só seria seguro se as séries fossem separadas. Não são:
`computeBaselineStats` e `selectTrendSessions` ignoram `result.scoringVersion`.
No caso mínimo `[acerto no span 2, erro, erro]`, scorer antigo = 1 e atual = 2.
Em onze sessões sintéticas sob o mesmo protocolo, a janela combinou quatro
valores antigos e quatro atuais e gerou mediana 1,5. Isso é resultado primário
falso e baseline comprometido no fluxo normal de upgrade: **P0**.

Os trials permitem reprocessamento. É preciso inventariar, recalcular com trilha
de auditoria ou separar uma nova série; reconstruir o baseline Corsi. A fronteira
é de scoring, não de estímulo.

### AG-03 — P1: antecipações tornam SDT não exaustivo

Uma resposta pré-onset em Go/alvo é gravada como incorreta e com resposta, logo
não satisfaz nem `correct` (hit) nem “sem resposta” (miss). A mesma resposta em
No-Go/não alvo satisfaz false alarm. Com 18 antecipações em 160 trials (11,25%,
abaixo do limiar de warning de 15%), a sessão Go/No-Go permaneceu `valid`, nove
Go desapareceram de `H+M`, todos os No-Go permaneceram em `FA+CR`, e d′ mudou em
mais de 0,1 diante da tabela exaustiva que trata as nove como misses.

A escolha normativa pode ser “miss/FA” ou exclusão simétrica; a regra atual não
é uma dessas. O padrão atinge também n-back/SART, com impacto primário no d′ de
n-back. Reprocessar exige nova `scoringVersion` e baseline de d′ separado.

### Novos P2 relevantes

- **AG-02:** o gerador Go/No-Go mudou no commit `9331fac` de sequência
  pseudoaleatória global para sequência circular balanceada por bloco, sem bump
  de `gonogo.standard.v1.0`. É quebra de identidade de protocolo; o efeito
  comportamental não foi medido, por isso P2 e não P1.
- **AG-04:** import aceita `result:{}` e só falha posteriormente no baseline.
  O fixture de quatro sessões foi aceito pela validação e causou exceção após a
  familiarização. Como requer backup malformado/editado, é P2.

Não foi encontrado novo P0 em divisão por zero, `NaN`/`Infinity`, zero tratado
como ausente, duplicação de trials, baseline contextual ou edição de condições
além dos mecanismos documentados. Essa ausência é limitada aos caminhos e
fixtures examinados; não é prova de inexistência.

## Principais correções à auditoria anterior

- AC-01: a direção não é consumida pela UI para essa métrica; P1 exagerado.
- AC-02: mecanismo correto, escopo padrão reduzido de seis para dois testes.
- AC-04: fronteira `2^-32` rebaixada para P3.
- AC-05/AC-14: mecanismo de timing não permite inferir magnitude; exigem
  experimento real.
- AC-09: `maxSpan` não é “maior span tentado”; é maior nível
  alcançado/desbloqueado. O `confirmedSpan` com um acerto é próximo da regra
  clássica, embora o protocolo adaptativo como um todo não seja normativamente
  equivalente.
- AC-12: unidade/fator de escala no resultado principal é P1, não “só
  apresentação” P2.
- AC-15: refutado pelas garantias de ordenação de IndexedDB + sort estável.
- AC-16: baseline e gráfico **ambos** aceitam `valid_with_warnings`; a
  divergência comprovada é `insufficientPractice`.
- O oráculo cobre matemática selecionada, não o sistema inteiro.

O veredito individual completo e os efeitos de versionamento estão em
[`MATRIZ_REVISADA_GPT56.md`](MATRIZ_REVISADA_GPT56.md). A revalidação de DOI e
alcance das fontes está em
[`VERIFICACAO_DE_FONTES_GPT56.md`](VERIFICACAO_DE_FONTES_GPT56.md).

## Conclusão global, pergunta por pergunta

### 1. “Internamente correto” está demonstrado?

**Não.** Parte da aritmética é correta nos fixtures, mas AG-01 mostra primária
histórica incompatível no Corsi; AC-02 produz z entre grandezas; AC-12 altera a
leitura normal; AG-03 quebra a partição SDT. “Internamente correto” só pode ser
dito por componente e versão, não globalmente.

### 2. “Reproduzível” está demonstrado?

**Parcialmente no sentido computacional.** Seed, trials e funções puras tornam
boa parte do scoring reproduzível. Não está demonstrada reprodução científica
fim-a-fim: timing físico não foi medido, versões históricas não separam todas as
mudanças e o Corsi antigo/atual compartilha protocolo.

### 3. “Defensável” está demonstrado ou apenas argumentado?

**Apenas argumentado.** Hautus, mediana/MAD e paradigmas conhecidos são escolhas
razoáveis. Faltam teste–reteste local, efeito de prática, validade convergente,
MDC/erro individual e chronometria externa para defender decisões pessoais.

### 4. O oráculo cobre o suficiente?

**Não.** É cross-check útil, mas não cobre UI, importação, histórico,
versionamento, timing ou três fluxos completos de teste. Seus 40 checks não são
40 invariantes independentes do produto.

### 5. Os P1 contradizem a frase anterior?

**Sim**, e AG-01 P0 a contradiz mais diretamente. Uma conclusão global de
correção não é compatível com resultado primário histórico misturado, unidade
principal falsa ou z dimensionalmente inválido.

### 6. Há confiança para usar antes das correções?

**Somente para exploração pessoal de baixo risco, olhando trials/medidas brutas
e conhecendo as ressalvas; não para decisões clínicas, diagnósticas ou de
medicação.** Não interpretar mudanças pequenas como melhora/piora validada.

### 7. Quais resultados atuais são não interpretáveis?

- baseline/gráfico Corsi que combine scoring anterior e posterior a
  `corsi-replay-1`;
- `confirmedSpan` Corsi legado como se fosse comparável ao atual, antes de
  reprocessar/separar;
- cartão e z de Stroop/Task Switching quando a primária é nula e o RT foi usado
  como fallback;
- d′ de sessões com respostas pré-onset até definir e reaplicar regra SDT
  simétrica, especialmente n-back;
- z de sessão inválida como evidência de mudança;
- unidade/escala mostrada no cartão principal de SART/d′. O número persistido
  pode ser recuperado, mas o texto exibido não é interpretável literalmente.

### 8. Quais históricos podem ser preservados?

- trials brutos, sequência, respostas, timestamps, condições e metadados — são
  a base para reprocessamento, ressalvada a acurácia física dos timestamps;
- Corsi antigo pode ser **preservado como registro**, mas não combinado; pode
  ser rescored deterministicamente dos trials;
- sessões Go/No-Go anteriores à mudança de gerador podem ser preservadas em
  coorte/protocolo separado, não descartadas;
- métricas não atingidas por fallback/apresentação continuam disponíveis em
  seus valores persistidos; a correção de UI não exige mutá-las;
- sessões bem formadas sem antecipação pré-onset mantêm as contagens SDT atuais,
  sujeitas à validação psicométrica ainda ausente.

## Limites desta revisão

- Não houve fotodiodo, keybot, osciloscópio nem matriz de dispositivos; AC-05 e
  AC-14 permanecem experimentais.
- Não houve amostra humana, reteste, validade convergente, efeito de prática ou
  estimativa de mudança mínima detectável.
- Nenhum backup real foi aberto. AG-04 usa somente estruturas sintéticas.
- O histórico Git prova mudança de código e identificadores; não prova quantas
  sessões reais, se alguma, existem em cada fronteira.
- Os testes adversariais focam os caminhos de maior risco e não constituem
  prova formal de ausência de outros bugs.
- Esta revisão não implementa correções. Recomendações de versionamento e
  reconstrução precisam de plano/migração auditável antes de alterar dados.
