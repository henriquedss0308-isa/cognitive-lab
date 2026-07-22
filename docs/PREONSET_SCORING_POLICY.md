# Política de scoring para respostas pré-onset

## Escopo e causa

Esta política corrige AG-03 exclusivamente em Go/No-Go, n-back e SART. Ela é uma
decisão metodológica explícita, simétrica e auditável; não é apresentada como
uma exigência universal da literatura.

O registro de trials já distinguia duas situações sob o mesmo
`invalidReason: "anticipation"`:

- uma resposta realmente anterior ao onset é persistida com
  `metadata.outcomeKind: "anticipation"`;
- uma resposta posterior ao onset, mas abaixo do limiar de RT, preserva o
  desfecho condicionado ao estímulo (`"hit"` ou `"false_alarm"`).

Antes desta correção, os scorers não consultavam essa diferença. Uma resposta
pré-onset em sinal podia não ser contada como hit nem miss, enquanto a mesma
resposta em ruído era contada como false alarm. Isso deixava a tabela SDT
assimétrica e podia enviesar d′ e taxas de comissão.

## Identificação e fronteiras

`isTruePreOnsetResponse(trial)` usa somente campos já persistidos:

1. quando onset e resposta são timestamps finitos e positivos, há pré-onset
   somente se `responseTimestamp < stimulusOnsetTimestamp`;
2. resposta exatamente no onset é pós-onset e permanece elegível;
3. na janela de dois frames em que o onset ainda é persistido como `0`, o
   fallback é o marcador direto `metadata.outcomeKind: "anticipation"`;
4. `invalidReason: "anticipation"` isoladamente nunca prova pré-onset;
5. resposta ausente, timestamp de resposta inválido e registro histórico
   incompleto sem evidência positiva não são classificados retroativamente como
   pré-onset.

Assim, uma resposta pós-onset de 50 ms permanece observada e entra como hit ou
false alarm conforme a condição. RT inválido, foco perdido e ordem do array de
trials não alteram por si sós a elegibilidade condicionada ao estímulo.

## Política

Trials verdadeiramente pré-onset:

- permanecem no histórico bruto;
- permanecem como antecipações nas métricas de RT e na validação da sessão;
- não são convertidos em ausência de resposta;
- são excluídos de hits, misses, false alarms e correct rejections;
- são excluídos dos denominadores de sinal e ruído, das taxas de comissão e das
  accuracies condicionadas ao alvo/condição.

Trials pós-onset rápidos continuam classificados pela resposta observada. A
limpeza de RT permanece inalterada.

A accuracy global também permanece inalterada: como usa todos os trials e o
campo `correct`, ela continua penalizando uma antecipação. Essa escolha difere
intencionalmente das métricas SDT e das proporções condicionadas ao estímulo,
que excluem o trial por não haver resposta observada após o estímulo. Contagens
de antecipação, flags, limiares de warning/invalidação e critérios de qualidade
também não mudaram.

## Invariantes SDT

Para cada tabela geral ou por nível:

```text
hits + misses = trials sinal elegíveis
falseAlarms + correctRejections = trials ruído elegíveis
```

Todo trial elegível entra exatamente em uma célula do seu lado. Todo trial
pré-onset é excluído dos dois lados pela mesma função central. Se um denominador
fica vazio, a taxa correspondente é `null`; d′ e critério também são `null` e
nenhum `NaN` ou `Infinity` é produzido. Com ambos os denominadores presentes,
a correção log-linear de Hautus continua aplicada a d′ e critério, inclusive
nas taxas brutas extremas 0 e 1.

## Impacto por teste

### Go/No-Go

Hits, misses, false alarms, correct rejections, hit rate, false alarm rate, d′,
critério, commission error rate e accuracies por condição usam apenas trials
elegíveis. Métricas gerais e RT não mudam.

No fixture de regressão de 160 trials, sete respostas pré-onset ficam abaixo do
limiar de warning: quatro em Go e três em No-Go. A tabela antiga efetiva era
`100/16/8/32` (hit/miss/FA/CR); a nova é `100/16/5/32`. Com Hautus, d′ muda de
aproximadamente `1,8915` para `2,1350`, delta `+0,2435`. Este exemplo documenta
o mecanismo confirmado e não define uma regra universal de magnitude.

### N-back

A política vale separadamente para alvos e não alvos, em 1-back e 2-back, e
também para a tabela geral. d′, hit rate, false alarm rate e as métricas
chamadas de accuracy por nível usam seus denominadores elegíveis. Um nível sem
alvos elegíveis retorna hit rate, accuracy de alvo e d′ como indisponíveis.

### SART

Uma resposta pré-onset em No-Go não é comissão condicionada ao dígito; uma
resposta pós-onset rápida continua sendo comissão. Commission error rate,
tabela SDT e accuracies Go/No-Go usam trials elegíveis. Omission count e
métricas de RT preservam as regras anteriores. Post-error slowing não foi
alterado: ele continua tratando a antecipação como erro sequencial geral, sem
reclassificá-la pela identidade do estímulo.

## Versionamento e histórico

Go/No-Go, n-back e SART passam a usar:

```text
sdt-hautus-1;preonset-exclusion-1
```

A mesma constante alimenta o resultado dos scorers e
`testDefinition.scoringVersion`. Simple RT, Choice RT, Stroop, Task Switching e
Corsi mantêm suas versões anteriores; Corsi permanece em
`sdt-hautus-1;corsi-replay-1`. Não há nova `protocolVersion`, pois estímulos,
quantidade de trials e temporização não mudaram.

A identidade longitudinal existente é `(testId, protocolVersion,
scoringVersion)`. Por isso, sessões antigas em `sdt-hautus-1` continuam visíveis
no histórico, mas não completam familiarização/baseline da nova série, não
entram no z da nova regra e não são conectadas a ela no gráfico.

Nenhuma sessão histórica é reprocessada, migrada ou sobrescrita por esta
mudança. Não há alteração de IndexedDB, importação/exportação ou backup.

## Limitações e trabalho futuro

- Registros incompletos sem timestamps válidos e sem o marcador explícito não
  permitem provar pré-onset; a política conserva sua elegibilidade em vez de
  inferir pela data ou pelo nome genérico `anticipation`.
- O alcance foi demonstrado apenas em Go/No-Go, n-back e SART. Outros testes não
  receberam mudança de scoring.
- Uma eventual recuperação de resultados históricos deve ser opcional,
  executada separadamente sobre uma cópia e acompanhada de relatório. Ela não
  faz parte de AG-03.
