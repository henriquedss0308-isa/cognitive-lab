# Replicação Crítica Independente — Fable

- **Produção auditada**: tag `v1.2.0-pre-validation` = `05ef727b4826ea92193ec0e2add40cd662eb1906`
- **Branch**: `review/fable-replication-critical-findings`
- **Data**: 2026-07-21
- **Alvos**: AG-01, AG-03, AC-12 (aprofundados) e AC-02 (verificação curta)
- **Artefato executável**: [`replication-oracle/`](../replication-oracle/) — 48 checks, 4 arquivos
- **Nenhuma correção implementada. Nenhum arquivo de produção alterado.**

## Método

Postura adversarial: a revisão do GPT-5.6, o `review-oracle/`, os documentos
anteriores e a minha própria auditoria prévia foram tratados como objetos
suspeitos. Cada alegação foi reproduzida por execução, não por leitura.

Três decisões metodológicas separam esta replicação da revisão do GPT-5.6:

1. **AG-01 usa o scorer legado REAL, não uma reimplementação.** O
   `review-oracle/reference.ts` do GPT contém funções `legacyCorsiConfirmedSpan`
   / `engineCorsiConfirmedSpan` escritas à mão a partir da leitura do commit.
   Isso é frágil: se a leitura estiver errada, o teste confirma o erro. Aqui o
   blob histórico `478a8fb^:src/tests/corsi/index.ts` foi extraído
   byte-idêntico (`git hash-object` = `8d8a030bf149cf14f1930c04a25c808563b55ad1`,
   igual a `git rev-parse 478a8fb^:src/tests/corsi/index.ts`) e é **executado**
   por shims de resolução em `replication-oracle/legacy/mirror/`. Os dois
   `scoreSession` — histórico e atual — rodam lado a lado sobre os mesmos
   `TrialRecord`.
2. **AG-03 usa o fluxo real de gravação.** Os trials são construídos por
   `buildTrialRecord` (a mesma função do `TestRunner`), não montados à mão, para
   que a classificação de antecipação seja a de produção.
3. **AC-12 monta o componente.** `MetricCard` é renderizado com
   `@testing-library/react` e o texto é lido do DOM — nenhuma inferência por
   substring, que é exatamente o que produziu erros nos dois relatórios
   anteriores (inclusive no meu).

## Avaliação da independência dos artefatos anteriores

O `review-oracle/` do GPT-5.6 é útil como cross-check, mas tem duas fraquezas
que afetam diretamente os achados replicados:

- **AG-01**: a regra legada é reimplementada, não executada. Minha replicação
  com o blob real **confirma** os números que o GPT reportou no caso mínimo
  (`legado 1 / atual 2`), então a reimplementação dele estava correta — mas isso
  só se sabe depois de executar o original.
- **AG-03**: os fixtures do GPT tratam "antecipação" como categoria única. O
  código distingue dois casos com consequências opostas (ver §2), e essa
  distinção muda a magnitude estimada do problema em uma ordem de grandeza.

A crítica do GPT ao `validation-oracle/` (fixtures e expected gerados no mesmo
processo, ausência de proveniência externa) é **procedente** e se aplica também
a esta replicação: os expected daqui são asserções inline derivadas das mesmas
definições. A mitigação usada foi diferente — executar o artefato histórico real
em vez de descrevê-lo.

---

## 1. AG-01 — Corsi histórico

### 1.1 Reconstrução histórica (fatos do Git, não da mensagem de commit)

| Fato | Verificação |
|---|---|
| Scorer legado | `478a8fb^:src/tests/corsi/index.ts`, blob `8d8a030b` |
| Scorer atual | introduzido por `478a8fb` (2026-07-20), replay via `applyCorsiResult` |
| Janela do scorer legado | de `585129f` (2026-07-02) até `478a8fb` — **18 dias** |
| `protocolVersion` | `corsi.forward.v1.0` **inalterada** nos dois períodos |
| Engine adaptativo | `git diff 478a8fb^ 478a8fb -- adaptive.ts` **só ADICIONA** `parseClickSequence`, `longestCorrectPrefix` e `replayCorsiTrials`. `applyCorsiResult`, constantes e estado não mudaram |
| `scoringVersion` | existe desde `585129f` (`sdt-hautus-1` em `scoring/common.ts:50`); `478a8fb` passa a gravar `sdt-hautus-1;corsi-replay-1` no Corsi |
| `extraMeta.span` | gravado pelo runner nos **dois** períodos (`478a8fb^:TestRunner.tsx:624`) |
| Migração de scoring | **não existe**. `db.ts` está em `DB_VERSION = 3`; a v3 recomputa apenas `result.baselinePhase` |
| Consumidores de `scoringVersion` | **nenhum**. `grep -rn "scoringVersion" src/` retorna só as duas escritas e a declaração de tipo |

Correção a um detalhe da narrativa do GPT: ele afirma que o scorer antigo
"podia encerrar após dois erros totais". O blob real conta `errorsAtSpan` **por
span** e quebra o laço externo ao fim do span — o efeito prático é próximo, mas
a divergência decisiva é outra: **o legado exigia 2 acertos consecutivos para
confirmar um span; o engine e o scorer atual exigem 1.**

### 1.2 Reprodução independente

`replication-oracle/checks/ag01_corsi_history.check.ts`, 12 checks. Coluna
"engine" = `applyCorsiResult` real, cujas regras não mudaram entre os períodos.

| Cenário | Legado | Atual | Engine | Divergente |
|---|---:|---:|---:|:--:|
| acerto, erro, erro | 1 | 2 | 2 | sim |
| dois acertos consecutivos | 2 | 2 | 2 | não |
| acerto, erro, acerto | 1 | 2 | 2 | sim |
| dois erros consecutivos | 1 | **0** | 0 | sim (direção oposta) |
| avanço multi-span (C,C,C,C,C,W,W) | 3 | 4 | 4 | sim |
| sessão interrompida (1 acerto) | 1 | 2 | 2 | sim |

Três conclusões que a revisão do GPT não estabelece:

1. **O scorer atual é o correto**: coincide com o engine que efetivamente
   governou a sessão em ambos os períodos. O legado divergia do próprio engine
   que o usuário executou — logo os valores antigos estavam errados *na época*,
   não apenas "sob outra convenção".
2. **A divergência não é um deslocamento constante.** No caso "dois erros" o
   legado dá 1 e o atual dá 0 (o legado tinha piso `START_SPAN − 1 = 1`; o atual
   tem piso 0). Não existe correção aditiva possível: **só reprocessamento a
   partir dos trials**.
3. **`maxSpan` também diverge** (dois acertos: legado 2, atual 3) — o achado
   atinge as duas métricas, não só `confirmedSpan`.

O mesmo conjunto de `TrialRecord` é persistível nos dois períodos: o engine e o
formato de gravação são idênticos, e apenas o `scoreSession` mudou.

### 1.3 Mistura longitudinal

Série sintética de 12 sessões com **o mesmo perfil de trials** (`multi_span`),
diferindo só pelo scorer usado na gravação (8 legadas = 3, 4 atuais = 4):

- `getValidAssessmentSessions` devolve **12** — nenhum filtro por
  `scoringVersion`; sessão **sem** o campo também é elegível;
- `computeBaselineStats` põe as duas regras na mesma janela: mediana
  `confirmedSpan` = 3 e **MAD = 0**;
- `evaluatePrimaryZ` cai em `zero_mad` com `delta = +1` para uma sessão atual —
  uma "melhora de um span" que é **puro artefato da fronteira de scoring**;
- `selectTrendSessions` devolve as 12 na mesma série, `hiddenOtherVersions = 0`:
  o gráfico exibe um **degrau 3 → 4 sem qualquer mudança de desempenho** e sem
  aviso, porque a `protocolVersion` é idêntica.

Nenhuma guarda foi encontrada. A alegação central do GPT está correta.

### 1.4 Severidade

O GPT classificou **P0**. Aplicando o critério desta rodada — "resultado
primário falso ou histórico incompatível **usado normalmente**" — o bug
estrutural é inequívoco, mas o "usado normalmente" depende de um fato que
**nenhuma das duas revisões verificou**: se existem sessões Corsi reais na
janela de 18 dias. Sem backup real, isso é indeterminado.

Portanto: **CONFIRMADO COM RESSALVAS, P1** — com escalada automática para P0 se
o inventário encontrar ≥ 1 sessão Corsi de avaliação anterior a `478a8fb`.
A escolha de P1 não é atenuação do mecanismo (que está provado por execução), e
sim recusa a afirmar impacto real sem o dado que o determina. O GPT afirmou P0
apoiando-se em uma série **sintética**; a série sintética prova o mecanismo, não
a existência do histórico.

Respostas diretas:

- **Escopo**: apenas Corsi, e apenas a fronteira pré/pós-`478a8fb`. Sessões
  posteriores são internamente consistentes.
- **Reprocessável?** Sim. Os `TrialRecord` guardam `expectedResponse`,
  `actualResponse` e `metadata.span`; `replayCorsiTrials` é puro e
  determinístico.
- **Versionamento necessário**: não é `protocolVersion` (o estímulo e o engine
  não mudaram — bumpar isso quebraria a série sem motivo). O correto é usar o
  `scoringVersion` **que já existe** como chave de partição/reprocessamento.
- **Ação segura antes de qualquer migração**: inventariar (contar sessões Corsi
  por `scoringVersion`, incluindo ausentes) **sem escrever**; exportar backup;
  reprocessar em cópia com trilha de auditoria (guardando o valor antigo);
  reconstruir o baseline Corsi só depois. Enquanto isso, suprimir z e tendência
  do Corsi se a série contiver as duas regras.

---

## 2. AG-03 — Antecipações e SDT

### 2.1 A distinção que a revisão do GPT não faz

`buildTrialRecord` produz **dois** tipos de trial rotulados `anticipation`:

| Tipo | Condição | `correct` | Entra em H+M (Go)? | Entra em FA (No-Go)? |
|---|---|---|---|---|
| **pós-onset rápida** | RT < limiar (150/100 ms) | `true` (se a tecla certa) | **sim, como hit** | sim |
| **pré-onset** | `beforeOnset` (`!onsetReady`) | `false` | **não** | **sim** |

Só o segundo quebra a partição. Verificado em execução: um trial `fastgo` tem
`correct: true`, `invalidReason: 'anticipation'`, `reactionTimeMs: null` — e
**conta como hit**. A revisão do GPT trata "antecipação" como categoria única e,
com isso, superestima o alcance.

**A assimetria é real e está confirmada**: com 9 pré-onset em Go, `H + M = 111`
contra `N_sinal = 120`, enquanto `FA + CR = 40 = N_ruído` sempre fecha.

### 2.2 Alcance por teste (executado)

| Teste | Partição quebrada? | Métrica atingida | Primária? |
|---|:--:|---|:--:|
| Go/No-Go | sim | `dPrime` | **sim** |
| SART | sim | `dPrime` (secundária) **e `commissionErrorRate`** | **sim** (a taxa) |
| n-back | sim | `dPrime2Back` | **sim** |

Achado adicional não presente na revisão do GPT: no SART, um pré-onset em
**No-Go** é contado como erro de comissão e **infla diretamente a métrica
primária** (`commissionErrorRate` = 4/28 no fixture, sendo 2 dos 4 pré-onset).
Isso é mais direto do que a via do d′.

### 2.3 Magnitude — onde diverjo do GPT

| Cenário | d′ atual | d′ com política "pré-onset Go = miss" | Δ |
|---|---:|---:|---:|
| Go/No-Go, 2 pré-onset (realista) | 2,173 | 2,121 | **0,052** |
| Go/No-Go, 9 pré-onset (fixture do GPT) | 2,132 | 1,922 | **0,210** |
| n-back 2-back, 3 pré-onset (27 alvos) | 2,345 | 2,049 | **0,296** |

O GPT reporta "d′ muda em mais de 0,1" a partir de um fixture com 18
antecipações (11,25%). Duas correções:

1. **A frequência de 9 pré-onset em Go é pouco plausível.** A janela de
   `beforeOnset` é o intervalo entre `setPhase('stimulus')` e o carimbo do
   onset, isto é, **2 rAF ≈ 33 ms a 60 Hz** (`frameMonitor.ts:65-72`,
   `TestRunner.tsx:521`). Teclas na fixação/ISI **não** produzem trial: são
   contadas em `isiEarlyPresses` e o handler retorna (`TestRunner.tsx:498-504`).
   Acertar uma janela de 33 ms nove vezes em 160 trials exige um respondedor
   extremamente antecipatório — que produziria também muitos `earlyPresses`.
2. **Onde o problema é materialmente maior é o n-back**, não o Go/No-Go, porque
   o denominador de alvos é pequeno (~27 no 2-back): 3 pré-onset já deslocam o
   d′ primário em ~0,3.

Confirmado também: a sessão **permanece `valid`** com 11,25% de antecipações
(limiar de warning = 15%), e acima do limiar vira `valid_with_warnings`, nunca
`invalid`. Ou seja, não há guarda de qualidade que impeça o d′ enviesado de
entrar no baseline.

### 2.4 Questão normativa (separada do bug)

**O código é internamente assimétrico?** Sim — provado.

**Qual política deve substituí-la?** Não há consenso que imponha uma única
resposta; a escolha precisa ser declarada, não descoberta:

- **(A) pré-onset Go = miss, No-Go = FA** — mantém a partição exaustiva e é
  conservadora (penaliza antecipação). Coerente com o tratamento canônico de
  respostas antecipatórias como erro em Go/No-Go, mas contamina d′ com
  variância motora.
- **(B) excluir pré-onset dos dois denominadores** — trata a antecipação como
  trial perdido, não como desempenho. Verificado numericamente: coincide
  **exatamente** com o d′ atual no lado Go (`symm.dPrime === real.dPrime`), de
  modo que adotar (B) preservaria os valores históricos de d′ no lado do sinal e
  exigiria mudar apenas o lado do ruído.
- **(C) invalidar a sessão acima de um limiar de pré-onset** — ortogonal, pode
  compor com (A) ou (B).

Não afirmo que alguma delas seja universal. (B) tem a propriedade prática de
minimizar ruptura histórica; a decisão é normativa e do projeto.

**Veredito: CONFIRMADO COM RESSALVAS, P1.** Mecanismo confirmado e presente em
três testes, atingindo métrica primária em todos os três; ressalvas quanto à
frequência plausível (janela de 33 ms) e quanto à magnitude ter sido estimada a
partir de um fixture pouco realista. Exige nova `scoringVersion` se a política
mudar; baselines de `dPrime` (Go/No-Go), `dPrime2Back` (n-back) e
`commissionErrorRate` (SART) precisariam ser reconstruídos apenas se a política
escolhida alterar valores históricos — sob (B), o lado Go não muda.

---

## 3. AC-12 — Apresentação, unidade e escala

18 checks de renderização real (`ac12_rendering.check.tsx`). Nota de leitura:
`textContent` devolve `"2ms"` porque valor e unidade são `<span>` irmãos com
`gap-1`; a tela mostra `2 ms`.

### 3.1 Cartão principal

| Teste | Primária | Valor | **Renderizado** | Correto? |
|---|---|---:|---|:--:|
| gonogo | `dPrime` | 2,4 | **`2 ms`** | não |
| nback | `dPrime2Back` | 1,87 | **`2 ms`** | não |
| sart | `commissionErrorRate` | 0,11 | **`0.11 ms`** | não |
| corsi | `confirmedSpan` | 5 | **`5 ms`** | **não** |
| simple_rt / choice_rt | `medianCorrectRT` | 412,7 | `413 ms` | sim |
| stroop | `stroopCostRT` | 88,4 | `88 ms` | sim |
| taskswitch | `switchCostRT` | 120,2 | `120 ms` | sim |

**Correção à minha auditoria anterior e à revisão do GPT-5.6**: ambas
afirmaram que o Corsi escapava da unidade falsa. **Não escapa.** O guard é
`metricKey.includes('span')` e a chave é `confirmedSpan` — com "S" maiúsculo.
`'confirmedSpan'.includes('span') === false`, verificado em execução. O ramo
`|| metricKey.includes('span')` de `Results.tsx:237` é **código morto**: nenhuma
chave de métrica do projeto contém "span" minúsculo.

Logo o alcance é **4 dos 8 testes**, não 3 — asserção explícita no check
"ALCANCE".

### 3.2 Perda de resolução

`MetricCard` usa 0 casas decimais salvo quando a chave contém `Rate` ou é
exatamente `accuracy`. Consequências verificadas: `d′ 2,49 → "2"` e
`d′ 2,6 → "3"`; `criterion 0,42 → "0"`; `stroopCostAccuracy 0,043 → "0 ms"`.
Para o d′, cuja faixa útil é ~0–4, exibir inteiros descarta praticamente toda a
variação que o monitoramento longitudinal pretende detectar.

### 3.3 Bordas

`null → "—"` com unidade omitida (correto); `0` exibido e não confundido com
ausente (correto); negativos preservam sinal (`-13 ms`); `d′ −0,4 → "-0 ms"`.

### 3.4 Cálculo × apresentação

O valor persistido e o z **não são afetados**: `MetricCard` só formata.
`evaluatePrimaryZ` recebe o número bruto. Confirmado por execução.

Mas há uma **contradição interna**: o gráfico usa `formatTrendValue`, que está
correto (`0,11 → "11,0%"`, `d′ → "2,40"`). A **mesma sessão** exibe
`0.11 ms` no cartão e `11,0%` no gráfico; `2 ms` no cartão e `2,40` no gráfico.

### 3.5 Severidade

O GPT elevou de P2 para P1. **Concordo, e o alcance é maior do que ele
estabeleceu.** Justificativa pelo critério: "interpretação principal falsa em
caminho plausível" — o caminho não é apenas plausível, é **o caminho único e
inevitável** de toda sessão normal de 4 dos 8 testes; não requer dado
degenerado. Um usuário que lê `0.11 ms` como um tempo, ou que não distingue
d′ 2,4 de 2,6 porque ambos aparecem como `2`, tira conclusão falsa da tela
principal.

Contra-argumento considerado e rejeitado: "é só cosmético, o dado está certo".
O dado persistido está certo, mas o produto é a leitura — e a leitura é falsa em
unidade **e** em resolução, na métrica que o próprio sistema destaca como
principal. Não é P0 porque nada é corrompido e a correção é puramente de
apresentação, sem migração de dados.

**Veredito: CONFIRMADO E AMPLIADO, P1.**

---

## 4. AC-02 — verificação curta

6 checks (`ac02_fallback_scope.check.ts`).

- **O fallback existe**: `Results.tsx:149-155`, `customMetrics[primária] ?? medianCorrectRT`,
  com o z avaliado contra o baseline da **chave original**.
- **Stroop alcança**: 60 trials legítimos (20 incongruentes corretos, 20 neutros
  corretos, 20 congruentes todos incorretos) ⇒ `stroopCostRT === null`,
  `medianCorrectRT ≈ 600 ms`, sessão **não** `invalid`. Contra um baseline de
  custo plausível (mediana 90 ms), o z resultante é **|z| > 10** — verificado.
- **Task Switching alcança**: mesmo mecanismo com `mixed_switch` sem acertos.
- **Go/No-Go, SART, n-back, Corsi não alcançam** pelo caminho normal: Hautus
  mantém d′ finito havendo sinal e ruído; o gerador do SART sempre produz
  trials No-Go; `confirmedSpan` é sempre numérico e `0 ?? x === 0` preserva o
  zero. **simple_rt e choice_rt** são inócuos: a primária já *é*
  `medianCorrectRT`.
- **Escopo confirmado: 2 dos 8**, e a razão é estrutural — apenas primárias do
  tipo "custo" (diferença entre condições) podem virar `null` com trials
  válidos.

**Veredito: CONFIRMADO, P1** — escopo do GPT-5.6 (2 testes) está correto e
corrige a minha auditoria anterior, que insinuava alcance maior.

---

## 5. Divergências com o GPT-5.6

| # | Ponto | GPT-5.6 | Esta replicação |
|---|---|---|---|
| 1 | AG-01 severidade | P0 categórico | P1, escalando a P0 mediante inventário; série sintética prova mecanismo, não histórico real |
| 2 | AG-01 mecanismo | "encerrava após dois erros totais" | O legado conta erros **por span**; a divergência decisiva é **2 acertos consecutivos vs. 1** para confirmar |
| 3 | AG-01 método | scorer legado **reimplementado** | scorer legado **executado** (blob `8d8a030b`) — os números dele batem, mas isso precisava ser demonstrado |
| 4 | AG-01 alcance | `confirmedSpan` | `confirmedSpan` **e** `maxSpan`; divergência **não é offset constante** (pisos 1 vs 0) |
| 5 | AG-03 mecanismo | "antecipação" como categoria única | Duas categorias; a **pós-onset rápida conta como hit** e não quebra nada. Só pré-onset quebra |
| 6 | AG-03 magnitude | Δd′ > 0,1 com 18 antecipações | Cenário realista (2 pré-onset) dá Δ ≈ 0,05; janela física é de **~33 ms (2 rAF)** por trial |
| 7 | AG-03 pior caso | Go/No-Go | **n-back** (Δ ≈ 0,3 com 3 pré-onset, poucos alvos) e **SART**, onde pré-onset em No-Go infla a **primária** diretamente |
| 8 | AG-03 política | "miss/FA ou exclusão simétrica" | Exclusão simétrica **preserva exatamente** o d′ atual no lado Go — propriedade que favorece essa opção e não estava documentada |
| 9 | AC-12 alcance | 3 testes (Corsi escaparia) | **4 testes**: `'confirmedSpan'.includes('span')` é `false`; o guard de span é código morto |
| 10 | AC-12 resolução | ênfase em unidade | Unidade **e** resolução: d′ 2,49 e 2,4 renderizam igual; `criterion 0,42 → "0"` |
| 11 | AC-02 | P1, 2 testes | Concordo integralmente (corrige minha auditoria anterior) |

Onde o GPT-5.6 **acertou e eu errei antes**: AC-02 (escopo de 2, não ~6);
AC-01 (a direção não é consumida — P2, não P1); AC-12 merecendo P1.
Onde **ambos erramos**: o Corsi na formatação de unidade.

## 6. Limitações

- **Nenhum backup real foi aberto.** A existência de sessões Corsi legadas é
  indeterminada — é exatamente o fato que decide P1 vs P0 em AG-01.
- A frequência real de respostas pré-onset é desconhecida; a janela de ~33 ms é
  derivada do código, não medida com participante.
- Os shims em `legacy/mirror/` reexportam `buildBaseResult` e tipos atuais.
  Isso é seguro para o objeto auditado (só métricas custom do Corsi foram
  comparadas) e a assinatura foi verificada no diff, mas não reconstrói o
  ambiente histórico completo.
- AC-12 foi verificado no `MetricCard` isolado com as expressões de unidade de
  `Results.tsx` reproduzidas como fixture; a página inteira não foi montada.
- Os demais achados (AC-01, AC-03…AC-11, AC-13…AC-20, AG-02, AG-04) não foram
  reexaminados nesta rodada.
- Nenhuma alegação aqui substitui validação psicométrica ou de timing físico.

## 7. Conclusão

Os três achados prioritários **se sustentam**, mas nenhum exatamente como
descrito. AG-01 é um bug estrutural provado por execução do artefato histórico
real, cuja severidade final depende de um inventário que ainda não foi feito.
AG-03 é uma assimetria real, porém mais estreita no mecanismo (só pré-onset) e
mais grave onde o GPT não olhou (n-back e a primária do SART). AC-12 é o mais
robusto dos três: atinge 4 dos 8 testes no caminho normal, sem exigir nenhum
dado degenerado, e é o único que já está afetando toda leitura de tela hoje.

A ação de menor risco e maior retorno imediato é AC-12 (correção de
apresentação, sem migração). AG-01 exige inventário antes de qualquer decisão.
AG-03 exige uma escolha normativa declarada antes de qualquer código.
