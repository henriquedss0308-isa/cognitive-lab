# Matriz revisada de achados — GPT-5.6

Versão de produção: `v1.2.0-pre-validation`
(`05ef727b4826ea92193ec0e2add40cd662eb1906`). Revisão executada na branch
`review/adversarial-gpt56-v1`.

Severidade aplicada: P0 = resultado principal falso/corrupção/uso normal
diretamente comprometido; P1 = conclusões comprometíveis em caminho plausível;
P2 = limitação relevante, caso raro ou apresentação enganosa; P3 =
documentação, nomenclatura, cobertura ou dívida. “—” significa que o mecanismo
alegado foi refutado.

## Contagem

- Vereditos dos 20 AC: 8 `CONFIRMADO`, 5 `CONFIRMADO COM RESSALVAS`, 4
  `RECLASSIFICADO`, 1 `REFUTADO`, 0 `INCONCLUSIVO` e 2
  `EXIGE EXPERIMENTO REAL`.
- Tratando confirmações com ressalvas como confirmações: **13 confirmados**.
- Severidade dos AC ativos: **0 P0 · 2 P1 · 11 P2 · 6 P3**, além de um achado
  refutado. A contagem anterior era 0 P0 · 2 P1 · 12 P2 · 6 P3.
- Novos achados: **AG-01 P0, AG-02 P2, AG-03 P1 e AG-04 P2**.
- Total revisado, incluindo AG e excluindo AC-15 refutado: **1 P0 · 3 P1 ·
  13 P2 · 6 P3**.

## AC-01 a AC-20

| ID | Veredito único | Sev. anterior → revisada | Confiança | Mecanismo, reprodução independente e resultado observado | Avaliação do auditor, impacto real e decisão recomendada |
|---|---|---:|---|---|---|
| AC-01 | **RECLASSIFICADO** | P1 → **P2** | Alta | [`taskswitch/index.ts`](../src/tests/taskswitch/index.ts) calcula `accRepeat − accPure`. Cinco fixtures em [`review-oracle/adversarial.check.ts`](../review-oracle/adversarial.check.ts) confirmaram: piora = −0,5/−1, melhora = +0,5, empate = 0 e a acurácia continua definida sem RT válido. `metricDirections.mixingCostAccuracy = -1`, mas a métrica não é primária nem pertence a `baselineMetricKeys`. | O auditor encontrou incoerência de fórmula/nome/metadado, mas errou ao afirmar uma inversão efetiva na interface: `metricDirection` só é consumido pelo z da métrica **primária**, e esta métrica secundária é mostrada crua. Não há sinal universal para uma diferença expressa em acurácia; é preciso declarar a convenção. Menor decisão: renomear para “diferença de precisão (mista−pura)” e direção `+1`, ou inverter a fórmula para custo positivo e manter `-1`. |
| AC-02 | **RECLASSIFICADO** | P1 → **P1** | Alta | Execução sintética dos seis testes mostrou primária `null`, RT mediano 500, sessão `valid` e `|z| > 10` somente em **Stroop** (condição incongruente sem RT correto) e **Task Switching** (switch sem RT correto). Go/No-Go, SART, n-back e Corsi padrão mantiveram primária numérica. [`Results.tsx`](../src/pages/Results.tsx) passa o fallback de RT a `evaluatePrimaryZ`, que continua buscando a chave primária no baseline. | O mecanismo é real e P1 continua proporcional, mas o escopo “seis testes” estava exagerado. Em sessões padrão, só dois têm subconjunto condicional vazio capaz de separar primária e RT geral. Importações malformadas ampliam o alcance por outro mecanismo (AG-04). Decisão: ausência deve permanecer ausência; nunca substituir entre unidades. |
| AC-03 | **CONFIRMADO** | P2 → **P2** | Alta | [`Results.tsx`](../src/pages/Results.tsx) calcula/exibe z sem guarda por `quality`; teste inválido ainda pode ter primária e baseline. | O badge e avisos tornam a invalidade visível e a sessão não contamina o baseline, por isso P2, não P1. Suprimir z/linguagem de mudança para sessões inválidas. |
| AC-04 | **RECLASSIFICADO** | P2 → **P3** | Alta no mecanismo; alta na raridade | [`random.ts`](../src/utils/random.ts) divide o estado unsigned por `0xffffffff`; o estado máximo produz exatamente `1`, permitindo índice superior. O check original reproduz a fronteira. Em sementes correntes e poucas centenas de sorteios, a chance por sorteio é `2^-32`. | O bug matemático existe, mas a severidade anterior ignora a raridade e não demonstrou sessão real afetada. Limitar a saída a `[0,1)` é higiene técnica; não invalida resultados já produzidos sem evidência da fronteira. |
| AC-05 | **EXIGE EXPERIMENTO REAL** | P2 → **P2** | Alta no código; baixa na magnitude física | [`frameMonitor.ts`](../src/utils/frameMonitor.ts) carimba onset após dois `requestAnimationFrame`; a pintura e o carimbo não são observados por hardware. | A hipótese de deslocamento é plausível, mas “subestimação sistemática de aproximadamente um frame” não decorre do código nem de Bridges. Medir com fotodiodo e atuador em combinações dispositivo/navegador; até lá, não prometer acurácia absoluta. |
| AC-06 | **CONFIRMADO** | P2 → **P2** | Alta | Busca de escrita de `refreshRate` mostra que a estimativa não é populada e o monitor usa fallback de 60 Hz; em telas rápidas, limiares de frame ficam insensíveis. | Limitação de controle de qualidade, não prova de RT falso. Estimar refresh por sequência de rAF e registrar a distribuição real. |
| AC-07 | **CONFIRMADO COM RESSALVAS** | P2 → **P2** | Alta no desenho; média no dano | [`baseline.ts`](../src/statistics/baseline.ts) congela a referência geral nas válidas 4–11. Reprodução existente confirma que a 12ª não altera a janela. | É decisão explícita que protege contra baseline deslizante, não bug aritmético. Pode envelhecer e perder representatividade; magnitude e horizonte exigem dados longitudinais. Manter congelamento com política visível de rebaseline/versionamento. |
| AC-08 | **CONFIRMADO** | P2 → **P2** | Alta | [`nback/index.ts`](../src/tests/nback/index.ts) denomina como `accuracy` taxas calculadas apenas sobre alvos; execução/leitura mostram hit rate, não acurácia incluindo rejeições corretas. | Rótulo muda a interpretação, mas d′ primário permanece separado. Renomear para “taxa de acerto em alvos” e expor FA/CR. |
| AC-09 | **CONFIRMADO COM RESSALVAS** | P2 → **P2** | Alta | Replay do Corsi mostra `maxSpanReached` como nível alcançado/desbloqueado, que pode não ter sido efetivamente executado; `confirmedSpan` sobe com um acerto. | A falta de semântica é real. Porém, a recomendação anterior “maior span tentado” também é incorreta, e um acerto aproxima `confirmedSpan` do span clássico de Kessels mais que o texto sugeria. Rotular `maxSpan` como “maior nível alcançado/desbloqueado”, documentar a regra e proibir comparação normativa direta. |
| AC-10 | **CONFIRMADO** | P2 → **P2** | Alta | [`scoring/common.ts`](../src/scoring/common.ts) usa 150 ms fixos em `postErrorSlowing`, embora SART/simple RT configurem outro limiar; RTs válidos de 100–150 ms podem entrar em RT mas não em PES. | Inconsistência secundária real e recomputável. Passar a configuração do teste à função. |
| AC-11 | **CONFIRMADO COM RESSALVAS** | P2 → **P2** | Alta | Código e Robertson (1997) confirmam 252 trials em seis blocos e fonte fixa local versus 225 contínuos e cinco tamanhos aleatórios no original. | Sustenta “SART modificado” e não comparabilidade normativa automática, não “SART inválido”. Documentar a variante ou, se aproximar o protocolo publicado, criar nova `protocolVersion`. |
| AC-12 | **RECLASSIFICADO** | P2 → **P1** | Alta | Renderização real do [`MetricCard`](../src/components/common/MetricTooltip.tsx) mostrou SART `0.11 ms` em vez de 11% e d′ 2,4 como `2 ms`; o caminho ocorre em sessões normais no cartão principal. | O auditor chamou de “só apresentação”, subestimando que a apresentação é o resultado usado pela pessoa. É P1 porque unidades/fator 100/resolução podem mudar uma conclusão normal, embora o valor persistido e o z não sejam corrompidos. Substituir heurísticas de substring por schema explícito de unidade, escala e casas. |
| AC-13 | **CONFIRMADO** | P2 → **P2** | Alta | [`taskswitch/index.ts`](../src/tests/taskswitch/index.ts) força o primeiro trial de cada bloco misto a `mixed_repeat` por usar `i > 0`, mesmo que a tarefa mude em relação ao trial anterior do bloco precedente. | Contaminação pequena, constante e primária. Usar condição própria/excluir da diferença; versionar scoring ao recomputar. A literatura apoia o contraste, mas a conclusão depende principalmente da lógica do gerador. |
| AC-14 | **EXIGE EXPERIMENTO REAL** | P2 → **P2** | Alta no código; baixa na magnitude | Fixação/ISI/duração usam timers web; duração física, latência de entrada e erro fim-a-fim não são registrados. | O risco é real; os valores “±1 frame” e a precisão desta aplicação não foram medidos. Bridges/Anwyl-Irvine sustentam validação externa específica, não a magnitude alegada. |
| AC-15 | **REFUTADO** | P3 → **—** | Alta | [`baseline.ts`](../src/statistics/baseline.ts) não tem desempate explícito, mas `getAll()` do IndexedDB retorna por chave crescente e o sort ES2019 é estável; a ordenação anterior por `startedAt` preserva a ordem de chave nos empates. Não foi produzido caso em que leituras idênticas troquem a janela. | A alegada não determinação não existe no caminho suportado. Desempate explícito por `sessionId` pode melhorar legibilidade/defesa contra refactor, mas não é achado científico nem exige migração. |
| AC-16 | **CONFIRMADO COM RESSALVAS** | P3 → **P3** | Alta | [`chartSelectors.ts`](../src/components/charts/chartSelectors.ts) inclui `insufficientPractice`; baseline exclui. Ambos, contudo, incluem `valid_with_warnings`. | A auditoria errou metade do escopo: não há divergência para warnings. Marcar/excluir apenas sessões realmente inelegíveis e explicar séries. |
| AC-17 | **CONFIRMADO** | P3 → **P3** | Alta | Ramo `insufficient_data` de [`getBaselinePhase`](../src/statistics/baseline.ts) não é retornado. | Código morto sem impacto numérico. Remover ou definir condição alcançável. |
| AC-18 | **CONFIRMADO** | P3 → **P3** | Alta | [`rtProcessing.ts`](../src/statistics/rtProcessing.ts) chama de `invalidTrialCount` apenas trials corretos cujo RT foi invalidado. | Nomenclatura ambígua, não resultado falso exibido. Renomear/documentar. |
| AC-19 | **CONFIRMADO** | P3 → **P3** | Alta | No Corsi, `medianCorrectRT` mede a duração de reprodução da sequência (ou até o primeiro erro), mas cartão/tooltip usam “tempo de reação” genérico. | Preservar número e dar rótulo/tooltip específico. |
| AC-20 | **CONFIRMADO COM RESSALVAS** | P3 → **P3** | Alta | `npm run lint` passou com quatro warnings; build passou com bundle JS de 844,08 kB e aviso de chunk. | Evidência técnica confirmada, mas agrupa fast refresh, teste e tamanho de bundle sem impacto científico demonstrado. Tratar como dívida separada, não como validação do instrumento. |

## Compatibilidade, histórico e sustentação científica dos AC

| ID | Resultados históricos | `scoringVersion` | `protocolVersion` | Baseline | Evidência científica adequada |
|---|---|---|---|---|---|
| AC-01 | Só se o sinal numérico for alterado; hoje é secundária | Sim se inverter o número; não se apenas renomear/metadado | Não | Não entra no baseline atual | Convenção de contraste deve ser explícita; Rogers & Monsell não impõe um sinal único para “acurácia” |
| AC-02 | Persistidos preservados; a tela/z é que fica falso no caso alcançado | Não | Não | Não reconstruir; impedir o fallback | Evidência de unidades e execução basta; não é questão bibliográfica |
| AC-03 | Persistidos preservados; interpretação do z inválido não | Não | Não | Não | Regra de qualidade interna |
| AC-04 | Preservar salvo evidência de índice fora do domínio | Não | Não | Não | Matemática/distribuição discreta |
| AC-05 | Indeterminado sem hardware | Não | Não | Não antes de medir | Bridges/Anwyl-Irvine: suporte à medição, não à magnitude |
| AC-06 | Preservar com metadado de dispositivo/refresh ausente | Não | Não | Não | Engenharia de timing |
| AC-07 | Dados preservados; referência pode tornar-se obsoleta | Não | Possível nova série ao rebaseline | Sim se política mudar | MAD não valida congelamento temporal |
| AC-08 | Números preservados; rótulo histórico corrigível | Não | Não | Não | Definições SDT |
| AC-09 | Preservar com semântica documentada; normas externas não | Não se só rotular | Não | Não | Kessels + contraponto Berch |
| AC-10 | Recomputável dos trials | Sim para distinguir PES antigo/novo | Não | Só se PES vier a integrar baseline | Regra interna |
| AC-11 | Preservar como variante local | Não se documentar | **Sim** se estímulo/blocos mudarem | Sim para nova versão | Robertson 1997 |
| AC-12 | Valor persistido preservado; apresentação antiga não | Não | Não | Não | Schema de unidades |
| AC-13 | Recomputável dos trials/ordem | **Sim** | Não, se só reclassificar para scoring | Sim para `switchCostRT` | Contraste task-switching; regra exata depende do protocolo local |
| AC-14 | Indeterminado quanto à acurácia absoluta | Não | Só se o agendamento do estímulo mudar materialmente | Possível após mudança | Bridges/Anwyl-Irvine |
| AC-15 | Preservados | Não | Não | Não | IndexedDB + ES2019 refutam o mecanismo |
| AC-16 | Preservados | Não | Não | Não | Elegibilidade interna |
| AC-17 | Preservados | Não | Não | Não | Não aplicável |
| AC-18 | Preservados | Não | Não | Não | Não aplicável |
| AC-19 | Preservados | Não | Não | Não | Semântica da tarefa |
| AC-20 | Preservados | Não | Não | Não | Não aplicável |

## Novos achados AG

| ID | Severidade | Confiança | Mecanismo, código e reprodução | Impacto, histórico e versionamento | Decisão recomendada |
|---|---:|---|---|---|---|
| **AG-01** | **P0** | Alta | O commit `478a8fb` corrigiu o scoring Corsi por replay, mas manteve `corsi.forward.v1.0`. O mesmo replay `[acerto, erro, erro]` produz `confirmedSpan=1` no scoring antigo e `2` no engine/score atual. [`baseline.ts`](../src/statistics/baseline.ts) e [`chartSelectors.ts`](../src/components/charts/chartSelectors.ts) filtram por protocolo, não por `result.scoringVersion`. O teste adversarial misturou quatro resultados antigos e quatro atuais na janela, obtendo mediana 1,5, e exibiu todos na mesma série. | Resultado **primário histórico falso** em sessões pré-`corsi-replay-1`, misturado normalmente após upgrade: P0. Trials permitem recomputação determinística. A `scoringVersion` já existe no resultado, mas precisa particionar/identificar séries; não exige mudar estímulo. Baseline Corsi deve ser reconstruído após rescore ou separado por versão. | Antes de qualquer uso longitudinal, inventariar Corsi por scoring version; reprocessar trials antigos com relatório imutável ou iniciar nova série; nunca combinar valores legado/atual. |
| **AG-02** | **P2** | Alta no versionamento; média no efeito | O commit `9331fac` substituiu a sequência pseudoaleatória global por geração circular balanceada por bloco, mantendo `gonogo.standard.v1.0`. O diff altera contagem por bloco, distribuição serial e consumo da seed; tags posteriores contêm a mudança sob o mesmo identificador. | Sessões legítimas antes/depois podem representar protocolos de estímulo diferentes na mesma série. O resultado não é aritmeticamente falso, e a magnitude comportamental não foi medida: P2. Histórico deve ser preservado em séries separadas. Exige nova `protocolVersion`, não nova scoring version; baseline Go/No-Go deve respeitar a fronteira. | Mapear a versão do app/commit das sessões antigas; se não for recuperável, marcar coorte pré-mudança como protocolo desconhecido e excluir do baseline misto. |
| **AG-03** | **P1** | Alta no mecanismo; média na regra normativa | [`trialResponse.ts`](../src/engine/trialResponse.ts) grava resposta pré-onset como `anticipation`, `correct=false`, com resposta real. Nos scorers SDT, antecipação em Go/alvo não é hit nem miss, mas em No-Go/não alvo é false alarm. Em 160 Go/No-Go, 9 antecipações Go + 9 No-Go mantiveram `quality=valid`; `H+M` ficou nove abaixo dos Go, `FA+CR` permaneceu completo e o d′ diferiu em mais de 0,1 de uma tabela exaustiva. O padrão também existe no n-back/SART, com relevância primária no n-back. | Primária d′ pode ser enviesada em sessão plausível e válida: P1. Há escolha normativa (contar como miss/FA ou excluir simetricamente), mas a tabela atual é internamente assimétrica. Trials permitem recomputar. Exige `scoringVersion`; não protocolo. Baselines de d′ precisam ser reconstruídos/particionados. | Definir política explícita para trials antecipados e aplicá-la simetricamente ao conjunto sinal/ruído; testar exaustividade `H+M=N_sinal` e `FA+CR=N_ruído`. |
| **AG-04** | **P2** | Alta | [`validateImportedSession`](../src/storage/export.ts) exige apenas que `result` seja objeto. Quatro sessões sintéticas com `result:{}` foram aceitas; após as três de familiarização, [`computeBaselineStats`](../src/statistics/baseline.ts) lançou exceção ao acessar métricas ausentes. | Caminho exige backup malformado/editado, não backup real válido, portanto P2. Pode persistir dado que derruba dashboard/baseline. Não exige versão de scoring/protocolo nem reconstrução de dados legítimos; requer revalidação/quarentena da importação. | Validar profundamente `result`, números finitos e coerência com teste/protocolo; importar por item com relatório e sem ativar registro inválido. |

## Prioridade resultante

1. **AG-01:** separar/recomputar Corsi histórico antes de interpretar baseline.
2. **AC-12, AC-02 e AG-03:** impedir resultado principal enganoso ou z entre
   grandezas incompatíveis; versionar/reconstruir d′ quando a regra for definida.
3. **AG-02:** estabelecer fronteira de protocolo Go/No-Go.
4. Resolver os P2 de semântica, timing e variante metodológica; AC-05/AC-14 só
   podem ser encerrados com experimento físico.
5. Tratar P3 como clareza/cobertura, sem apresentá-los como validação científica.
