# Baseline sensível ao contexto — V1

Funcionalidade interna do Cognitive Lab. Não é aplicação separada, não tem
banco próprio, servidor próprio nem repositório próprio.

---

## 1. O problema metodológico

Até aqui, o baseline pessoal de cada teste usava sessões válidas mas
**praticamente ignorava as condições registradas nelas**.

Um baseline de oito sessões podia conter:

- sessões com uso registrado de lisdexanfetamina;
- sessões explicitamente sem lisdexanfetamina;
- sessões sem informação nenhuma;
- quantidades muito diferentes de sono;
- cafeína em algumas e não em outras;
- níveis distintos de estresse, energia e sonolência;
- contextos emocionais distintos.

A mediana e o MAD estavam **matematicamente corretos**. O problema não é a
conta: é que a referência podia representar uma **mistura de contextos**, e
comparar a sessão de hoje contra essa mistura embute uma pergunta que nunca foi
respondida — "comparada a você em quais condições?".

Esta V1 torna isso transparente e permite comparações contextuais mais
honestas. Ela **não** conclui nada sobre efeitos.

## 2. O que a V1 faz — e o que não faz

| Faz | Não faz |
|---|---|
| Cria referências separadas para sessões com e sem lisdexanfetamina | Cria baseline por dose, horário, cafeína, emoção ou quantidade de sono |
| Mostra como as demais condições da sessão se comparam às da referência | Usa essas condições para escolher referência ou alterar z-score |
| Diz qual referência foi usada e por quê | Afirma que o medicamento melhorou ou piorou o desempenho |
| Permite classificar sessões antigas manualmente | Classifica sessões antigas automaticamente |
| Preserva integralmente a referência geral | Recalcula, reclassifica ou apaga sessões existentes |

**Nesta V1, apenas o estado de lisdexanfetamina seleciona uma referência
diferente.** Todos os demais dados enriquecem a interpretação e mostram
diferenças de contexto — nada mais.

## 3. Referência geral × referências contextuais

Para cada par `testId + protocolVersion` podem existir três referências.

### 3.1 Referência geral

É a referência que o Cognitive Lab já tinha: as sessões elegíveis **nº 4–11**,
com as três primeiras servindo de familiarização (spec §3.2).

Ela continua usando as regras atuais e **produz exatamente os mesmos valores
que produzia antes desta missão**. Nada nesta funcionalidade altera seu
conjunto de sessões ou seus números — há testes de regressão que falham se
isso mudar ([`regression.test.ts`](../src/features/context-aware-baseline/__tests__/regression.test.ts)).

No código, `buildGeneralReference` **delega inteiramente** a
`computeBaselineStats`; não existe um segundo caminho que recalcule a
referência geral de outro jeito.

### 3.2 Referência com lisdexanfetamina

Apenas sessões elegíveis em que a pessoa registrou explicitamente
`status = 'taken'`.

### 3.3 Referência sem lisdexanfetamina

Apenas sessões elegíveis em que a pessoa registrou explicitamente
`status = 'not_taken'`.

**Sessões com estado desconhecido não entram em nenhuma das duas.**

## 4. Regra exata de construção

### 4.1 Familiarização global

As **três primeiras sessões elegíveis gerais** do teste continuam sendo a
familiarização, exatamente como antes.

A familiarização **não reinicia por contexto**. A justificativa é metodológica:
a curva de aprendizado é do *protocolo* — layout, teclas, ritmo, estratégia —,
não do estado medicamentoso. Quem fez as três primeiras sessões medicado não
precisa reaprender o teste ao registrar a primeira sessão sem medicação, e
exigir três novas familiarizações por contexto atrasaria toda a funcionalidade
em seis sessões sem ganho metodológico.

### 4.2 Janela contextual: oito sessões

Depois da familiarização global, **cada contexto coleta a própria janela**: as
**primeiras oito sessões elegíveis daquele contexto**.

```
elegíveis (ordem cronológica):  [1] [2] [3] │ [4] [5] [6] [7] ...
                                 └─ familiarização global ─┘
                                            │
     com lisdexanfetamina  →  as 8 primeiras 'taken' daqui em diante
     sem lisdexanfetamina  →  as 8 primeiras 'not_taken' daqui em diante
```

Exemplo, com sessões intercaladas:

| Nº | Estado | Familiarização | Janela "com" | Janela "sem" |
|---|---|---|---|---|
| 1–3 | qualquer | ✔ | — | — |
| 4 | taken | | 1/8 | |
| 5 | not_taken | | | 1/8 |
| 6 | unknown | | — | — |
| 7 | taken | | 2/8 | |

### 4.3 Quando a comparação começa

A **nona sessão pós-familiarização daquele contexto** é a primeira que pode ser
comparada à sua referência contextual já completa.

Isso cai naturalmente do fato de que **a própria sessão nunca entra na
referência com que é comparada** — a tela de resultados já excluía a sessão
corrente para a referência geral, e a mesma exclusão vale aqui.

### 4.4 Congelamento

A referência contextual **congela** depois que suas oito sessões são definidas.
O congelamento é **posicional**, igual ao da referência geral: sessões novas
entram depois da oitava e portanto nunca deslocam a janela já formada.

### 4.5 Ordenação determinística

A janela contextual é posicional, então a ordem importa. O caminho contextual
ordena por `(startedAt, sessionId)` — com desempate explícito por id.

O baseline geral **não foi tocado**: ele continua ordenando só por `startedAt`.
Mudar isso poderia deslocar janelas já consolidadas, que é exatamente o que
esta funcionalidade não pode fazer. A consequência é que, no caso raro de duas
sessões com timestamp idêntico ao milissegundo, a ordem interna do caminho
contextual pode diferir da do geral. Preferiu-se essa divergência restrita a
arriscar reescrever o passado interpretativo do baseline geral.

### 4.6 Regras estatísticas preservadas

A referência contextual é entregue **com a forma de `BaselineStats`** e passa
pela mesma função `evaluatePrimaryZ` da referência geral. Consequências:

- mediana, MAD e `n` vêm de `computeMetricStats` — o **mesmo código numérico**
  do baseline geral; a única diferença entre as referências é quais sessões
  entram, nunca como a conta é feita;
- o mínimo de valores não nulos por métrica (`n ≥ 6`, spec §3.2) continua
  valendo, igual, na referência contextual;
- `MAD = 0` continua recebendo o tratamento da spec §4 (delta bruto, sem z);
- a direção da métrica continua vindo de `metricDirections`, nunca de
  heurística de nome.

## 5. Seleção da referência e fallback

| Estado da sessão | Referência contextual completa | Referência usada |
|---|---|---|
| `taken` | sim | com lisdexanfetamina |
| `taken` | não | **geral**, com aviso de fallback |
| `not_taken` | sim | sem lisdexanfetamina |
| `not_taken` | não | **geral**, com aviso de fallback |
| `unknown` | — | **geral**, informando que o contexto não foi registrado |

Se **nem a referência geral** estiver consolidada (fase ≠ monitoring), nada é
fabricado: a tela mantém o comportamento atual de "baseline em construção".

A interface sempre diz qual referência foi usada. Quando cai no fallback,
explica o motivo e avisa que **a referência geral pode misturar contextos
diferentes**.

## 6. Tratamento de desconhecidos

> **Campo ausente nunca significa "não tomou". Campo ausente significa
> `unknown`.**

Esta é a regra mais importante da funcionalidade, e ela aparece em três lugares:

1. **No modelo**: `unknown` é um valor de primeira classe e o padrão.
2. **Na interface**: três opções explícitas (Sim / Não / Não informado) num
   grupo de rádios. **Nunca um checkbox** — desmarcado seria indistinguível de
   não respondido, e essa diferença decide se a sessão entra numa referência
   contextual. Nenhuma opção vem marcada.
3. **Na leitura**: qualquer coisa que não seja `'taken'` ou `'not_taken'`
   resolve para `unknown`, sem lançar.

### 6.1 Nenhuma inferência a partir de texto livre

Os campos herdados `substances.medicationName`, `medicationDose` e
`medicationTime` são **preservados integralmente** e **nunca lidos para
classificar**.

"Venvanse", "lisdex", "remédio", "30 mg", "estimulante" continuam sendo apenas
texto que a pessoa escreveu. Classificar por substring reescreveria
silenciosamente o passado com base num palpite — e um palpite errado colocaria
uma sessão numa referência à qual ela não pertence, contaminando a comparação
justamente onde ela deveria ser mais honesta.

Há testes que falham se qualquer um desses textos passar a classificar algo.

## 7. Campos usados apenas como contexto

Estes campos aparecem na seção "Contexto da sessão comparado à referência
utilizada" e **não entram em nenhum cálculo**:

| Campo | Como é apresentado |
|---|---|
| Sono (horas) | valor atual · mediana da referência · N disponível |
| Qualidade do sono | valor atual · mediana · N |
| Cafeína | atual (sim/não/desconhecido) · composição da referência |
| Horário | horário da sessão · mediana da referência |
| Energia, foco, humor, estresse, motivação, sonolência | valor atual · mediana · N |
| Fome e hidratação | valor atual · mediana · N |
| Contexto emocional | emoção e quadrante atuais · composição de quadrantes da referência |
| Percepção relacional | percepção atual · **apenas a contagem** de sessões da referência que tinham o campo |

Regras de agregação:

- toda agregação opera **só sobre valores presentes**; o `N` reportado é o
  número de sessões que de fato tinham o dado;
- conjunto vazio devolve `null` — nunca zero fingido, nunca divisão por zero,
  nunca `NaN` ou `Infinity`;
- a percepção relacional **nunca** seleciona referência e **nunca** tem seus
  detalhes exibidos na composição.

### 7.1 Ausência de inferência causal

A seção mostra números brutos lado a lado e nada mais. Não existe, e não deve
passar a existir:

- score de similaridade entre contextos;
- score de saúde, medicação ou qualidade contextual;
- qualquer frase que ligue uma condição ao desempenho.

Frases como "você foi pior porque dormiu menos", "a lisdexanfetamina melhorou
seu desempenho", "você funciona melhor medicado" ou "sua emoção prejudicou sua
cognição" são **proibidas**, e há testes que falham se aparecerem na tela.

A linguagem aceitável é a que descreve sem explicar: *"Comparado à sua
referência com lisdexanfetamina"*, *"As condições abaixo são apresentadas
apenas como contexto"*, *"Esta associação não demonstra causa"*.

## 8. Classificação descritiva da composição

A tela de composição rotula cada janela como:

- contexto registrado predominantemente **com** lisdexanfetamina;
- contexto registrado predominantemente **sem** lisdexanfetamina;
- contexto **misto**;
- contexto **insuficientemente documentado**.

Regra exata (`classifyComposition`), com limiar declarado em
`PREDOMINANCE_THRESHOLD = 0.7`:

1. se **metade ou mais** das sessões da janela não tem registro ⇒
   *insuficientemente documentado* — com metade da janela sem classificação,
   falar em predominância afirmaria mais do que se sabe, já que o rótulo
   descreve a janela inteira e não só o subconjunto classificado;
2. senão, se ≥ 70% das **documentadas** são `taken` ⇒ predominantemente com;
3. senão, se ≥ 70% das documentadas são `not_taken` ⇒ predominantemente sem;
4. senão ⇒ misto.

**Esta classificação nunca altera scoring, elegibilidade ou z-score.** É um
rótulo de leitura, e o limiar é arbitrário — por isso é declarado, testado e
mantido fora de qualquer cálculo.

## 9. Modelo de dados

```ts
type LisdexamfetamineStatus = 'taken' | 'not_taken' | 'unknown'

interface MedicationRecord {
  status: LisdexamfetamineStatus
  dose?: string       // descritivo, nunca usado para segmentar
  time?: string       // descritivo, nunca usado para segmentar
  updatedAt?: string  // carimbado só quando o conteúdo muda
}

interface TestConditions {
  // ... campos existentes, inclusive os de medicamento em texto livre
  medications?: {
    lisdexamfetamine?: MedicationRecord
  }
}
```

Vive em `TestConditions.medications`, ou seja, dentro do `checkIn` da sessão (e
do espelho em `result.checkIn`) — o mesmo lugar que o Emotion Lab usa, e que
**nenhum caminho de scoring lê**.

### 9.1 Identificador estável

A chave é `lisdexamfetamine`, o nome do fármaco — **não** uma marca comercial.
Nomes comerciais mudam por país e fabricante; reaproveitá-los como chave
reescreveria o passado das sessões gravadas. É a mesma regra de identidade do
catálogo de emoções: rótulos visíveis podem ser reescritos livremente, ids
publicados não.

A estrutura aninhada por medicamento permite acrescentar outros fármacos no
futuro sem mudar o formato — mas **esta versão só reconhece
`lisdexamfetamine`**, e qualquer outra chave é descartada no saneamento.

### 9.2 Saneamento

| Situação | Comportamento |
|---|---|
| `status` válido | preservado |
| `status` inválido/desconhecido | vira `unknown`, preservando dose e horário escritos |
| registro que não é objeto | descartado |
| registro vazio (`unknown` sem dose nem horário) | descartado — equivale à ausência |
| medicamento não suportado | descartado (lista branca) |
| `updatedAt` não parseável | descartado |
| campos extras | descartados (lista branca) |

Diferente do contexto emocional — que **descarta** o dado malformado —, aqui o
status inválido cai para `unknown`. O motivo: `unknown` já é exatamente o
significado de "não sabemos", então preservar a dose e o horário que a pessoa
escreveu é melhor que apagá-los. Nos dois casos o resultado é o mesmo para a
seleção de referência: a sessão fica fora das janelas contextuais.

### 9.3 `updatedAt`

Carimbado **apenas quando o conteúdo do registro muda**. Reabrir a edição de
condições e salvar sem mexer neste campo preserva o carimbo anterior — mesmo
contrato do `emotionalContext.updatedAt`.

O `TestConditions.recordedAt`, que já existia, continua registrando o último
salvamento das condições como um todo.

## 10. Compatibilidade retroativa

**Não houve migração de IndexedDB. `DB_VERSION` continua 3.**

Decisão deliberada, pela mesma razão do Emotion Lab: `medications` é uma
propriedade **opcional aninhada** em um objeto já existente (`checkIn`). Não
cria store, não cria índice e não muda a chave de nenhum registro. Sessões
gravadas antes da funcionalidade simplesmente não têm o campo — o que o tipo já
considera válido. Um bump de versão seria ruído com risco de regressão e nenhum
ganho.

Sessões antigas, verificado por teste:

- são classificadas como `unknown`;
- **abrem normalmente**;
- **aparecem no histórico**;
- **entram na referência geral** conforme as regras existentes;
- ficam **fora das referências contextuais** até serem classificadas
  explicitamente;
- nunca têm o estado inventado por inferência.

### 10.1 Edição pós-sessão

A edição de condições permite registrar `taken`, `not_taken` ou `unknown` a
qualquer momento depois da sessão.

Essa edição altera **apenas as condições**. Não altera trials, métricas,
scoring bruto, qualidade, flags nem datas originais — só referências derivadas
e comparações futuras. Como o baseline é derivado a cada leitura, classificar
uma sessão antiga passa a incluí-la na janela contextual correspondente a
partir da próxima consulta.

### 10.2 Reaproveitamento de condições

O botão "usar condições da sessão anterior" **não copia** o estado
medicamentoso.

Sono e ambiente costumam se repetir de um dia para o outro; o estado
medicamentoso é um fato **do dia**. Copiá-lo registraria como "de hoje" um dado
que a pessoa não deu hoje e — pior — colocaria a sessão numa referência
contextual sem nenhuma confirmação. Mesmo princípio já aplicado ao contexto
emocional.

## 11. Importação e exportação

| Aspecto | Comportamento |
|---|---|
| Exportação | incluído no backup JSON, dentro de `sessions[].checkIn` |
| Importação | restaurado quando válido; saneado campo a campo |
| Valor desconhecido | fallback seguro para `unknown` |
| Malformado | **nunca rejeita a sessão** — trials e demais condições seguem intactos |
| Backup antigo | importa normalmente; nenhum campo é inventado |
| Reimportação | `sessionId` existente ⇒ ignorado; sem duplicação |
| Dados locais | nunca sobrescritos por backup (política skip-existing, spec §10b) |
| Ida e volta | exportar → importar → exportar preserva o conteúdo |

Descartar os trials de uma sessão inteira por causa de um campo contextual
corrompido seria destrutivo — por isso o registro malformado some e o resto da
sessão sobrevive.

## 12. Onde está o código

```
src/features/context-aware-baseline/
├── types.ts                    modelo, tipos de referência e metadados
├── medicationContext.ts        classificação, saneamento, comparação
├── contextualEligibility.ts    elegibilidade, ordenação, familiarização
├── contextualReference.ts      construção das janelas e das estatísticas
├── referenceSelection.ts       escolha da referência + fallback
├── contextSummary.ts           resumo contextual descritivo
├── components/
│   ├── LisdexamfetamineField.tsx      campo Sim/Não/Não informado
│   ├── ReferenceBadge.tsx             qual referência foi usada, e por quê
│   ├── ReferenceComposition.tsx       composição e progresso X/8
│   └── SessionContextComparison.tsx   contexto comparado à referência
└── __tests__/
```

Separação deliberada: **nenhuma regra estatística vive em componente React**.
Classificação, elegibilidade, construção das janelas, seleção da referência,
cálculo estatístico e resumo contextual são funções puras e testáveis; os
componentes só apresentam.

Pontos de integração:

| Arquivo | Mudança |
|---|---|
| `src/types/index.ts` | `TestConditions.medications` |
| `src/statistics/baseline.ts` | extração de `computeMetricStats` (pura, sem mudança de comportamento) |
| `src/components/test/TestConditionsForm.tsx` | campo estruturado + carimbo no submit |
| `src/pages/Results.tsx` | seleção da referência, badge, contexto complementar, composição |
| `src/pages/TestDetail.tsx` | composição das referências do teste |
| `src/storage/export.ts` | saneamento na importação |
| `src/storage/repository.ts` | não reaproveita o estado medicamentoso |

## 13. Limitações da V1

- **Um único medicamento.** Só lisdexanfetamina seleciona referência.
- **Dois contextos.** Não há referência para "tomou em dose reduzida",
  "tomou tarde" ou combinações.
- **Oito sessões por contexto** é um número herdado da regra geral, não
  derivado de cálculo de potência estatística.
- **A referência contextual demora.** São necessárias 3 sessões de
  familiarização + 8 daquele contexto antes da primeira comparação contextual —
  e, se a pessoa alterna, as duas janelas avançam metade da velocidade.
- **Sessões antigas ficam de fora** até serem classificadas manualmente, uma a
  uma.
- **O horário mediano é uma mediana linear sobre um dado circular.** Uma
  referência que mistura sessões às 23h e à 01h produz um horário mediano no
  meio da tarde, que não descreve nenhuma das duas. Preferiu-se manter a conta
  simples e documentar a limitação a introduzir estatística circular numa
  informação puramente contextual.
- **O baseline continua derivado, não persistido.** Importar sessões antigas
  pode recompor janelas (spec §3.2 — o aviso existente vale também para as
  contextuais).
- **Nada aqui demonstra efeito.** Comparar-se a si mesmo em dois contextos não
  é um experimento controlado: ordem, expectativa, aprendizado, sono e dezenas
  de outros fatores variam junto.

## 14. Explicitamente fora do escopo

Não implementado nesta versão, por decisão:

- recomendações médicas de qualquer tipo;
- previsão de desempenho;
- afirmação de causalidade;
- ajuste automático de medicamento;
- baseline por dose, por horário da dose, por cafeína, por emoção ou por
  quantidade exata de sono;
- score de similaridade entre contextos;
- score de saúde, medicação ou qualidade contextual;
- machine learning ou IA interpretando contexto;
- nuvem, login, sincronização ou múltiplos usuários;
- alteração dos protocolos cognitivos.

Vários desses itens não são apenas "trabalho futuro": pontuar similaridade,
afirmar efeito de medicação ou recomendar conduta contradiz o objetivo desta
funcionalidade, que é **tornar a referência transparente**, não interpretá-la.
