# Auditoria Metodológica e Técnica — Cognitive Lab

Data: 2026-07-19 · Base: working tree em `main` (HEAD `9331fac` + mudanças locais de edição de condições)
Verificação de partida: **163 testes passam · `tsc -b` limpo · lint com 4 avisos (testes) · build ok**

---

## 1. Mapa da arquitetura real

```
main.tsx (StrictMode)
└─ App.tsx ─ BrowserRouter ─ AppProvider (contexto: sessions[] + settings, tudo em memória)
   ├─ Layout (nav) ─ Dashboard / Catalog / Batteries / History / Settings / TestDetail
   ├─ /test/:testId  → TestFlow  (orquestrador: condições → instruções → treino → avaliação)
   │                    └─ TestRunner (máquina de fases: ready→fixation→isi→stimulus→response→feedback→done)
   │                        ├─ StimulusDisplay / CorsiBoard (render por testId)
   │                        ├─ engine/trialRecorder → engine/trialResponse (classificação pura)
   │                        ├─ utils/frameMonitor (rAF), utils/timing (focus tracker, waits canceláveis)
   │                        └─ tests/corsi/adaptive (única máquina adaptativa)
   └─ /results/:sessionId → Results (z-score vs baseline, edição de condições)

tests/registry ─ 8 definições (CognitiveTestDefinition): geração seeded, scoring puro, configs
scoring/common ─ buildBaseResult → statistics/rtProcessing + sessionValidation
statistics/    ─ basic (mediana, MAD, robustZScore), signalDetection (Hautus), costs, baseline
storage/       ─ db (idb v2: stores sessions/settings), repository (CRUD), sanitize (NaN→null),
                 sessionCompletion (save+verify), sessionRecovery (só Corsi), export/import, resultsLoader
```

Fatos estruturais relevantes:
- **Persistência**: 1 registro `SessionRecord` por sessão contendo TODOS os trials embutidos (não há store de trials separado, ao contrário do que o README sugere com "ensaios individuais"). Cada `appendTrialToSession` reescreve o registro inteiro (leitura+put, O(n) por trial).
- **Sessões de treino nunca são persistidas** (TestFlow só liga `onTrialRecorded`/`onSessionStart` no modo assessment). O índice `by-mode` do IndexedDB só verá `assessment`.
- **Baterias não têm orquestração**: `batteryId`/`batteryPosition`/`rotationIndex`/`getDailyTests`/`getQuickRotatingTest` são schema/código mortos; o botão "Check-in" aponta para rota `/checkin` inexistente (cai no catch-all `Navigate to /`).
- **Resultados são congelados na escrita**: `scoreSession` roda uma única vez em `handleComplete`; nada recalcula resultados antigos (bom). O baseline, porém, é **derivado a cada leitura** (ver §3).

## 2. Fluxo completo de uma sessão (avaliação)

1. `/test/:id` → `TestFlow` monta com `sessionId = generateId()` (novo a cada montagem) e `deviceInfo = detectDevice()` (a cada render).
2. Passo `conditions` (opcional) → `pendingConditions`; `instructions`; `practice` (TestRunner modo training, nada persistido; `evaluatePractice` ≥60%/≥4 trials por padrão); `practice_done` → `assessment`.
3. TestRunner fase `ready` (efeito): regenera `seed = Math.random()*1e9` e `startedAt`; chama `onSessionStart` → `initAssessmentSession` grava `SessionRecord{status:'in_progress', quality:'valid', trials:[]}` **com quality 'valid' antes de existir qualquer scoring**.
4. Por trial: fixação 400 ms → ISI (`isiMs` seeded) → `registerStimulusOnset` (duplo rAF; timestamp = `timeOrigin+now`) → janela de resposta (`responseWindowMs`: SART=isiMs, simple_rt=1500, nback=2500, resto=2000; hardcoded, duplicando configs).
   - Tecla válida apenas nas fases `stimulus`/`response`. **Teclas durante fixação/ISI são descartadas sem registro** (antecipação real não medida — ver Q15/P1-9).
   - `buildTrialRecord` (puro) classifica via `classifyTrialResponse`, decide `invalidReason` (anticipation <150 ms, lapse, unfocused) e o trial é **persistido incrementalmente** via `appendTrialToSession` (guard contra sessão terminal e trialId duplicado no último índice).
   - Fixed-duration (SART/nback): resposta não aborta o loop; correção pendente finalizada pelo timer.
   - Corsi: sem timeout de resposta (trial pode durar horas); RT = clique final − onset.
5. `done` → `onComplete(recordedTrials, flags{windowLostFocus, tabChanged, droppedFrames}, meta{seed, startedAt})`.
6. `handleComplete`: `scoreSession` (puro) → `getBaselinePhase(validPrévias + 1)` (**off-by-one, P0-1**) → monta novo `SessionRecord` **do zero** (perde `checkIn`/battery no resume, P0-4) → `completeAssessmentSession` (save + leitura de verificação) → `refresh()` → navega para `/results/:id`.
7. Interrupções: ESC → `handleAbort` (status `abandoned`, quality `invalid`). Desmontagem sem conclusão → `onInterrupted` (status `interrupted`). **Reload/fechar aba → nada roda; sessão fica `in_progress` para sempre** (recuperável só em Settings; Corsi pode continuar, demais só reiniciar; "Descartar" DELETA o registro).

## 3. Fluxo do baseline (construção e consulta)

- Fonte única: `computeBaselineStats(sessions, testId, protocolVersion, metricKeys)` — chamada em Results, Catalog, Dashboard, TestDetail. **Nunca é persistido**; recomputado de todas as sessões a cada render.
- Elegibilidade (`getValidAssessmentSessions`): mesmo `testId` **e `protocolVersion`**, `mode==='assessment'`, `quality !== 'invalid'` (**inclui `valid_with_warnings`**), `!isDemo`, status `completed` (ou legado sem status), `completedAt` e `result` presentes, `!flags.insufficientPractice`. Ordenado por `startedAt`.
- Fase (`getBaselinePhase(n)`): n<3 → familiarization; n<11 → baseline_building; n≥11 → monitoring. `insufficient_data` é **inalcançável** (código morto).
- Janela: monitoring → `valid.slice(3, 11)` (sessões válidas nº 4–11, congelamento *de facto* por posição); building → `valid.slice(3)` (referência móvel crescente).
- Consulta em Results: baseline calculado **excluindo a própria sessão**; z-score robusto `direction·(v−mediana)/(1.4826·MAD)` exibido só se `phase==='monitoring'` e MAD>0; **direction vem de heurística de substring `includes('accuracy')` → sinal invertido para d′/span (P0-2)**; `primaryValue ?? 0` (P0-3); sem n mínimo por métrica.

**Congelamento**: o baseline não é recalculado "indefinidamente" no sentido de janela deslizante — a janela é sempre as válidas nº 4–11. Mas como é derivado, **qualquer evento que mude o conjunto ordenado (import de backup com sessões antigas, exclusão, mudança de regra de elegibilidade em upgrade) desloca a janela silenciosamente e reescreve o passado interpretativo**. Não há snapshot persistido nem aviso de recomposição (P1-1).

## 4. Inventário dos schemas persistidos (IndexedDB `cognitive-lab`, DB_VERSION 2)

| Store | keyPath | Índices | Conteúdo |
|---|---|---|---|
| `sessions` | `sessionId` | by-test(testId), by-date(startedAt), by-mode(mode), by-status(status) | `SessionRecord` completo: metadados, `flags`, `checkIn`, `deviceInfo`, `trials[]` embutidos, `result` (SessionResult com métricas congeladas, `baselinePhase`, `scoringVersion`), `randomizationSeed`, `adaptiveState` (Corsi), `trialProgress` |
| `settings` | `key`('app') | — | `AppSettings` + key |

- Migração v1→v2: cria `by-status` e backfilla `status:'completed'` (leitura também normaliza via `normalizeSession`).
- Sanitização (`NaN/±Infinity → null`) aplicada em `saveSession`/`appendTrialToSession`/`updateSessionConditions`, **mas não** em `updateSessionStatus` nem em `importSessions`.
- Backup (`AppBackup v1.0.0`): sessions + settings; **sem checksum, sem verificação de versão real, validação estrutural rasa** (P0-5).
- Estados possíveis observados: `in_progress` com `quality:'valid'` (estado imposssível semanticamente); `abandoned`/`interrupted` com `quality:'invalid'` e `flags.incomplete`; completed+result. Corrida ESC pós-done pode produzir `abandoned` **com** `result` (P1-11).

## 5. Matriz de protocolos, versões e métricas

| Teste | Protocolo | Trials (aval.) | Blocos | Janela resposta | Cleaning (antec./lapso ms) | Métrica primária (direção correta) | scoringVersion |
|---|---|---|---|---|---|---|---|
| simple_rt | reaction.simple.v1.0 | 45 | 4 | 1500 | 150/1500 | medianCorrectRT (↓) | sdt-hautus-1 |
| choice_rt | reaction.choice.v1.0 | 60 | 3 | 2000 | 150/2000 | medianCorrectRT (↓) | idem |
| stroop | stroop.standard.v1.0 | 120 | 4 | 2000 | 150/2000 | stroopCostRT (↓) | idem |
| gonogo | gonogo.standard.v1.0 | 160 | 4 | 2000 | 150/2000 | dPrime (↑) **UI trata como ↓** | idem |
| sart | sart.standard.v1.0 | 252 | 6 | =ISI 900, estímulo 250 fixed-duration | 100/900 | commissionErrorRate (↓) | idem |
| nback | nback.spatial.v1.0 | 180 (80×1b+100×2b) | 2 | 2500 fixed-duration | 150/2000 | dPrime2Back (↑) **UI ↓** | idem |
| corsi | corsi.forward.v1.0 | adaptativo (≤30) | 1 | **sem timeout** | 0/60000 | confirmedSpan (↑) **UI ↓** | idem |
| taskswitch | taskswitch.standard.v1.0 | 160 (40 puro×2+40 misto×2) | 4 | 2000 | 150/2000 | switchCostRT (↓) | idem |

Reprodutibilidade: `randomizationSeed` + `protocolVersion` + geradores determinísticos (LCG) reproduzem os estímulos dos 7 fixos; Corsi reproduz por `seed + trialIndex·997`. Estímulo/expectedResponse também ficam gravados por trial → **reprodução independente do gerador é possível**. Lacunas: `scoringVersion` é um rótulo global único; janelas de resposta hardcoded no TestRunner (não no protocolo); layout Corsi versionado apenas via atributo DOM (`corsi-fixed-layout-v1`), não no registro.

## 6. Invariantes metodológicos (os que o código deveria garantir)

I1. Sessão só entra no baseline se: assessment, completed, result presente, quality ≠ invalid, !isDemo, !insufficientPractice, mesmo protocolVersion. *(implementado em baseline.ts; TestFlow usa filtro divergente — P0-1)*
I2. Fase da sessão N (1-indexada, por teste+protocolo): N≤3 familiarization; 4≤N≤11 baseline_building; N≥12 monitoring. *(violado na gravação — P0-1)*
I3. Baseline (monitoring) = exatamente as válidas nº 4–11; imutável salvo recomposição explícita. *(janela ok; imutabilidade não garantida — P1-1)*
I4. z robusto exige: fase monitoring, MAD>0, valor presente, direção definida por métrica, n mínimo. *(3 das 5 condições violadas — P0-2, P0-3, P1-14)*
I5. Trial persistido ≤1 vez; nunca em sessão terminal. *(ok: token+claim+guard)*
I6. Resultado calculado uma única vez com o scoring vigente e congelado com `scoringVersion`. *(ok)*
I7. Transições de status: in_progress → {completed, abandoned, interrupted}; terminais imutáveis. *(violável via updateSessionStatus — P1-11)*
I8. Edição de condições altera apenas `checkIn`/`result.checkIn`. *(ok no código novo — updateSessionConditions)*
I9. Import nunca degrada dados locais silenciosamente. *(violado — P0-5)*
I10. Nenhum NaN/Infinity persistido. *(ok exceto updateSessionStatus/importSessions)*
I11. Comparações entre dispositivos/inputs diferentes são sinalizadas. *(não implementado: flags `differentDevice`, `differentInputMethod`, `browserZoomChanged`, `screenTooSmall`, `unstableRefreshRate`, `sessionPaused` nunca são setadas; `primaryDevice`/`estimateRefreshRate` nunca usados)*

## 7. Riscos de perda/corrupção de dados

| # | Risco | Vetor |
|---|---|---|
| R1 | Sobrescrita silenciosa por import (mesmo sessionId → `put`) | P0-5 |
| R2 | Registro malformado aceito pelo import quebra páginas (trials não-array etc.) | P0-5 |
| R3 | Resume do Corsi apaga `checkIn`/battery/deviceInfo original | P0-4 |
| R4 | ESC na janela pós-done rebaixa sessão completed para abandoned/invalid | P1-11 |
| R5 | "Descartar" em Settings DELETA sessão+trials permanentemente sob rótulo suave | P1-8 |
| R6 | Reload deixa `in_progress` zumbi eterno (nunca vira interrupted) | P1-7 |
| R7 | Falha de IndexedDB no meio da sessão → rejection não tratada, UI congela sem mensagem | P1-6 |
| R8 | Sem `navigator.storage.persist()` → IndexedDB elegível a eviction pelo navegador | P2-9 |
| R9 | Import substitui `settings` integralmente (perde estado local) | P0-5 |
| R10 | `JSON.parse` sem try/catch no import → exceção não tratada, sem feedback | P0-5 |

## 8. Contradições documentação × implementação

| # | Documento diz | Código faz |
|---|---|---|
| D1 | SITUACAO: "A partir da 11ª sessão válida: monitoramento" | Estatística: baseline = válidas 4–11; monitoramento efetivo na 12ª. README ("depois" das 8) concorda com o código de stats; o rótulo gravado por sessão concorda com nenhum (off-by-one, P0-1) |
| D2 | README: "Persistência IndexedDB, ensaios individuais" | Trials embutidos no registro da sessão; não há store de trials |
| D3 | README/SITUACAO: respostas antes do onset "registradas como antecipação" | Só o intervalo pós-`setPhase('stimulus')` pré-onset; teclas em fixação/ISI são descartadas sem registro |
| D4 | SITUACAO: "sessões interrompidas... exigem reiniciar, mantendo a interrompida no histórico" | Botão "Descartar" deleta permanentemente; reload nem sequer marca interrupted |
| D5 | SITUACAO: cada sessão "guarda os trials" (ambos os modos implícito) | Treino não é persistido |
| D6 | README: estrutura com `src/protocols/`, `src/charts/` | Diretórios não existem (embutidos) |
| D7 | Instruções Corsi: "termina após 2 erros no mesmo nível" | Engine: 2 erros *sem acerto intercalado*; scoring: 2 erros totais no span (3 regras distintas, P1-3) |
| D8 | README: "Comparação mobile/desktop registrada" (flags de dispositivo no schema) | Nenhuma flag de dispositivo é computada; nenhuma comparação/aviso existe |
| D9 | README: correlações contextuais "≥10 observações (preparado)" | Nenhum código de correlação existe |
| D10 | Baterias com "rotação equilibrada" | Rotação nunca aplicada; bateria apenas navega ao 1º teste; `/checkin` quebrado |

## 9. Bugs confirmados (P0 = resultado incorreto ou perda/corrupção)

### P0-1 · Fase de baseline gravada com off-by-one e filtro divergente
- **Evidência**: [TestFlow.tsx:163-174](src/pages/TestFlow.tsx) `getBaselinePhase(validSessions.length + (scored.quality !== 'invalid' ? 1 : 0))`, com filtro local sem `protocolVersion`/`completedAt`/`result`/`insufficientPractice`; vs [baseline.ts:7-14,46-49](src/statistics/baseline.ts).
- **Impacto**: a 3ª sessão válida é rotulada `baseline_building` (é familiarização); a 11ª é rotulada `monitoring` (é a 8ª do baseline). Em Results, o cabeçalho da 11ª sessão diz "Monitoramento" enquanto o cartão de z-score não aparece (fase recomputada dá building) — contradição visível. Rótulos errados ficam **persistidos** em `result.baselinePhase`.
- **Reprodução**: completar 3 avaliações válidas de um teste; abrir Results da 3ª.
- **Solução**: rotular com `getBaselinePhase(nPrévias)` usando `getValidAssessmentSessions` (mesma régua do stats); migração v3 recomputando `baselinePhase` das sessões completed (determinístico e reversível).
- **Arquivos**: TestFlow.tsx, statistics/baseline.ts, storage/db.ts (migração). **Testes**: fronteiras n=0,2,3,10,11,12; divergência de filtro. **Risco de regressão**: baixo (rótulo descritivo; stats já corretos).

### P0-2 · Direção do z-score invertida para métricas "maior é melhor"
- **Evidência**: [Results.tsx:124-131](src/pages/Results.tsx) `test.primaryMetricKey.includes('accuracy') ? 1 : -1`. Primárias `dPrime` (gonogo), `dPrime2Back` (nback), `confirmedSpan` (corsi) recebem −1.
- **Impacto**: em monitoramento, melhora aparece como z negativo e piora como positivo para 3 dos 8 testes — **interpretação clínico-pessoal invertida**.
- **Reprodução**: 12+ sessões gonogo válidas; sessão nova com d′ acima da mediana → UI mostra z<0.
- **Solução**: `metricDirections: Record<string, 1|-1>` explícito em cada `CognitiveTestDefinition`; proibir heurística por substring.
- **Arquivos**: tests/types.ts, 8 definições, Results.tsx. **Testes**: tabela de direção por teste; z de exemplo por métrica. **Risco**: baixo.

### P0-3 · z-score calculado com `?? 0` quando a métrica é nula
- **Evidência**: [Results.tsx:121-127](src/pages/Results.tsx) `primaryValue ?? 0` alimenta `robustZScore`.
- **Impacto**: sessão sem RTs válidos (ou d′ nulo) exibe z absurdo calculado contra 0.
- **Reprodução**: sessão monitoring com métrica primária nula (ex.: corsi sem sequências corretas → confirmedSpan 1 ok; melhor: gonogo com d′ null por bloco sem noise trials — ou simular). 
- **Solução**: `primaryValue === null → z = null` (+ mensagem "métrica indisponível nesta sessão").
- **Arquivos**: Results.tsx. **Testes**: unit no seletor de z. **Risco**: baixo.

### P0-4 · Resume (Corsi) descarta check-in, bateria e deviceInfo original
- **Evidência**: [TestFlow.tsx:203-234](src/pages/TestFlow.tsx) monta o registro final do zero: `checkIn: pendingConditions ?? undefined` (null no resume), sem `batteryId`/`batteryPosition`, `deviceInfo` = dispositivo atual.
- **Impacto**: perda silenciosa de dados contextuais registrados no início da sessão; troca de dispositivo entre início e resume passa despercebida.
- **Reprodução**: iniciar Corsi com condições preenchidas → interromper (navegar) → Settings → Continuar → concluir → Results: "Condições não registradas".
- **Solução**: em `handleComplete`, carregar o registro existente e fazer merge (preservar checkIn/battery/startedAt/deviceInfo original; se dispositivo atual difere, setar `flags.differentDevice` + aviso).
- **Arquivos**: TestFlow.tsx. **Testes**: integração de resume preservando campos. **Risco**: baixo-médio (tocar no caminho de conclusão; coberto por sessionCompletion tests).

### P0-5 · Import de backup: sobrescrita silenciosa, validação rasa, sem atomicidade de conteúdo
- **Evidência**: [export.ts:102-125](src/storage/export.ts) valida só `sessionId && testId && trials` truthy; [repository.ts:159-163](src/storage/repository.ts) `tx.store.put` incondicional; `saveSettings(backup.settings)` integral; [Settings.tsx:35-43](src/pages/Settings.tsx) `JSON.parse` sem try/catch.
- **Impacto**: (a) reimportar backup antigo **reverte silenciosamente** edições locais (ex.: condições editadas) — mesma chave, put vence; (b) `trials: "x"` ou `quality: "banana"` passam a validação → registros malformados **quebram History/Settings/export** e poluem o baseline (quality desconhecida ≠ 'invalid' conta como válida); (c) arquivo inválido → exceção não tratada; (d) settings do backup substituem os locais.
- **Reprodução**: exportar; editar condições de uma sessão; importar o mesmo arquivo → edição perdida. Ou importar `{version:'1',sessions:[{sessionId:'x',testId:'simple_rt',trials:'oops'}]}` → History quebra.
- **Solução**: validação estrutural estrita por sessão (trials array, enums whitelisted, campos mínimos tipados); política padrão **skip-existing** com relatório {novas, ignoradas, rejeitadas}; sanitize+normalize na escrita; try/catch com mensagem; settings: merge conservador (nunca sobrescrever silenciosamente).
- **Arquivos**: export.ts, repository.ts, Settings.tsx. **Testes**: import duplicado idempotente; sessão malformada rejeitada com relatório; enums inválidos; JSON inválido. **Risco**: médio (mudança de contrato do import — documentar).

## 10. Riscos prováveis ainda por reproduzir

| # | Suspeita | Como reproduzir |
|---|---|---|
| S1 | Re-render do TestFlow durante trial fixed-duration mata o loop (`loopAbort` no cleanup do efeito com dep `onInterrupted` instável) → trial nunca finaliza | Forçar re-render do TestFlow (ex.: outra aba do app chama refresh via contexto compartilhado?) durante SART; observar congelamento. Hoje improvável (nada re-renderiza TestFlow mid-run), mas o acoplamento é frágil |
| S2 | Dupla execução do efeito `ready` (StrictMode/dep instável) → `onSessionStart` 2× com seeds distintos | Dev StrictMode; conferir 2 puts do registro inicial (benigno hoje; vira bug se seed for usado antes) |
| S3 | `blockConditionSequences` do gonogo pode estourar exceção para algum seed raro → tela branca | Fuzz de seeds ampliado (teste atual cobre "many seeds", não todos) |
| S4 | Throttling de background em aba oculta: trials SART continuam expirando como omissão `unfocused` em vez de pausar | Ocultar aba 30 s durante SART; contar omissões unfocused |
| S5 | `startedAt` idêntico em imports (mesmo ms) → ordem instável do baseline entre plataformas | Import com timestamps duplicados |

## 11. Dívidas técnicas por severidade

**P1 (inconsistência metodológica importante)**
- **P1-1 Congelamento**: baseline derivado sem snapshot; import/exclusão recompõe janela silenciosamente. → Persistir snapshot na entrada em monitoring + ação explícita de recomposição com aviso.
- **P1-2 `valid_with_warnings` entra no baseline sem transparência** (README diz apenas que inválidas ficam de fora). → Decisão de spec (manter, com exibição da composição: "8 sessões · 2 com avisos").
- **P1-3 Corsi: 3 regras divergentes** (engine `applyCorsiResult` reseta `errorsAtSpan` no acerto e confirma span com 1 acerto; scoring exige 2 consecutivos e quebra com 2 erros totais no span; instruções dizem outra coisa). → Unificar: scoring por replay do engine; instruções alinhadas.
- **P1-4 SDT**: antecipações beforeOnset em trials Go somem de hits+misses (d′ sobre subconjunto) sem nota metodológica.
- **P1-5 Gráficos longitudinais** incluem sessões `invalid` e misturam protocolVersions (LongitudinalChart filtra só demo; TestDetail nem isso para a lista).
- **P1-6 Falha de persistência mid-sessão** → rejection não tratada, congelamento sem mensagem ([TestRunner.tsx:364-375,499-527](src/components/test/TestRunner.tsx)).
- **P1-7 `in_progress` zumbi** após reload; nunca transiciona para interrupted.
- **P1-8 "Descartar" deleta** trials permanentemente com update de status morto antes ([Settings.tsx:92-105](src/pages/Settings.tsx)).
- **P1-9 Antecipações em ISI invisíveis** (teclas descartadas; contradiz README; perde sinal de impulsividade).
- **P1-10 Comparação entre dispositivos não sinalizada** (flags mortas; `primaryDevice` jamais gravado; baseline mistura desktop/touch sem aviso).
- **P1-11 `updateSessionStatus` sem guarda terminal** + ESC ativo pós-done → completed vira abandoned ([repository.ts:66-75](src/storage/repository.ts), [TestRunner.tsx:451-457](src/components/test/TestRunner.tsx)).
- **P1-12 Demo contamina utilitários**: `getLatestConditions` pode carregar check-in fictício de demo para sessão real ([repository.ts:189-197](src/storage/repository.ts)); SpeedAccuracyChart plota demo junto com real.
- **P1-13 Estados impossíveis representáveis**: `in_progress` nasce `quality:'valid'`; `abandoned` pode ter `result` (corrida R4).
- **P1-14 z sem n mínimo** e **MAD=0 silencioso** (z some sem explicação; ver Q6).

**P2 (UX/manutenção/confiabilidade)**
- P2-1 Unidades/decimais do MetricCard por heurística de substring: d′ com " ms" e 0 decimais; commissionErrorRate " ms" (Results.tsx:190-215; MetricTooltip.tsx:22).
- P2-2 History lista sessões sem `result` (links mortos "Sessão não encontrada").
- P2-3 Catalog "Último RT" usa qualquer sessão (demo/in_progress).
- P2-4 Results permite z de sessão demo contra baseline real (guard `isDemo` ausente).
- P2-5 `responseWindowMs` hardcoded duplica configs (drift em manutenção).
- P2-6 `refreshRateEstimate`/`estimateRefreshRate` nunca usados → FrameMonitor fixo em 60 Hz; `droppedFramesEstimate: 0` gravado em trials respondidos de fixed-duration (métrica enganosa).
- P2-7 Import UX: `alert()` + `window.location.reload()`.
- P2-8 Backup sem versão checada/checksum; sem migração de forma no import.
- P2-9 Sem `navigator.storage.persist()` — risco real de eviction num app local-first.
- P2-10 Mobile: 7 de 8 testes exigem teclado físico; sem alvo de toque; `inputMethod` Corsi hardcoded 'mouse'.
- P2-11 Rota `/checkin` inexistente na página Baterias.
- P2-12 Testes tautológicos dão falsa confiança (completionFlow.test, "race guard" que testa array.includes de si mesmo).

**P3 (desejável)**
- P3-1 Código morto: `getDailyTests`, `getQuickRotatingTest`, `choiceRTCost`, `movingAverage`, `clamp`, `waitUntilFrame`, `waitRandomInterval`, `filterSessions`, `getSessionsByTest`, fase `insufficient_data`, flags mortas do §6-I11, `updateSessionStatus` pré-delete no Descartar.
- P3-2 `useRef(test.generateTrials(...))` regenera 160 trials a cada render (descartado).
- P3-3 `theme`/`fontScale` armazenados mas nunca aplicados ao DOM.
- P3-4 README desatualizado (D2/D6/D9); bundle 788 kB sem code-split; AppContext carrega todos os trials em memória.
- P3-5 `SessionResult.deviceInfo` duplica `SessionRecord.deviceInfo`.

## 12. Respostas às questões obrigatórias

1. **Sessões 4–11 e início do monitoramento**: pela estatística (`valid.slice(3,11)`), o baseline são as válidas nº 4–11 e o **monitoramento começa na 12ª**. Locais afetados pela regra: `statistics/baseline.ts` (FAMILIARIZATION_SESSIONS/BASELINE_SESSIONS/getBaselinePhase/slice), `TestFlow.handleComplete` (rótulo gravado — hoje off-by-one), `Results` (PHASE_LABELS + gate do z), `Catalog`/`Dashboard`/`TestDetail` (exibição de fase), README/SITUACAO (divergem entre si).
2. **Congelado?** Não formalmente. Janela posicional fixa (4–11) recomputada a cada leitura; import/exclusão/upgrade de regra recompõe silenciosamente (P1-1).
3. **Mudança de protocolo/scoring**: baseline é por `protocolVersion` (nova versão = novo baseline do zero; sem comunicação ao usuário). Resultados antigos ficam congelados com seu `scoringVersion` ('sdt-hautus-1'); nada recalcula; gráficos misturam versões de scoring sem anotação (P1-5).
4. **Invalidam vs advertem**: invalid = `incomplete`, `tooFewValidTrials`, `chanceLevelAccuracy`, accuracy < minAccuracy/2, interrupted/abandoned (via TestFlow). Warning = `tooManyAnticipations`, `tooManyOmissions`, `windowLostFocus`, `tabChanged` (+`differentDevice`/`browserZoomChanged` teóricos, nunca setados). `screenTooSmall` gera mensagem mas nunca é setada; `droppedFrames`/`insufficientPractice` não afetam quality (insufficientPractice exclui do baseline por filtro próprio).
5. **`valid_with_warnings` entra no baseline?** Sim, sempre (quality ≠ invalid). Sem condição adicional e sem transparência (P1-2).
6. **MAD zero/insuficiente**: `robustZScore` → null; UI oculta o cartão sem explicação. Métricas discretas (confirmedSpan) e accuracy em teto tornam MAD=0 provável — monitoramento silenciosamente indisponível (P1-14). Não há fallback (ex.: IQR) nem mensagem.
7. **NaN/Infinity/divisão por zero**: storage sanitiza (exceto `updateSessionStatus`/import). Estatística retorna null em vazio/0. Enganosas: z com `?? 0` (P0-3); `droppedFramesEstimate:0` em fixed-duration respondido (P2-6); `accuracy` de `conditionRTAndAccuracy` retorna 0 (não null) para subconjunto vazio — mascarável; anticipationRate subestimada (P1-9).
8. **Import duplicado duplica?** Não (put por sessionId) — mas **sobrescreve** silenciosamente (P0-5/R1).
9. **Import parcialmente inválido corrompe?** Sim — validação rasa deixa passar `trials` não-array e enums inválidos que quebram páginas e poluem baseline (P0-5/R2).
10. **Editar condições altera só metadados?** Sim — `updateSessionConditions` altera apenas `checkIn` e `result.checkIn` (I8 ok). Porém o **resume** apaga checkIn (P0-4).
11. **Impede comparação entre dispositivos?** Não. Registra `deviceInfo` por sessão e nada mais: sem flag, sem aviso, baseline mistura dispositivos (P1-10).
12. **Sessões interrompidas irrecuperáveis/indescartáveis?** Reload gera `in_progress` eterno (não vira interrupted); "Descartar" deleta em vez de arquivar; protocolos fixos não têm caminho para "arquivar como interrompida" sem deletar (P1-7/P1-8).
13. **Versão suficiente para reproduzir?** Estímulos: sim (seed+gerador+trials gravados). Scoring: sim no congelado; parcial na comparabilidade (scoringVersion único global). Janelas de resposta e layout Corsi ficam fora do protocolo persistido (P2-5).
14. **Código = interface?** Divergências: D1 (fase), D3 (antecipação), D7 (regras Corsi), P0-2 (z invertido contradiz "comparado ao seu baseline"), unidades P2-1.
15. **Mouse/toque/teclado**: teclado é o único input dos 7 testes fixos (sem alvos de toque; mobile inviável); Corsi aceita clique/toque mas grava `inputMethod:'mouse'` sempre; `detectDevice` chuta por UA/largura (P2-10).
16. **Perda de foco confiável?** Blur/focus/visibilitychange atualizam tracker; trials marcam `windowFocused`/`visibilityState` e `invalidReason:'unfocused'`; flags de sessão `windowLostFocus`/`tabChanged` viram warning. Limite: perda de foco entre trials (ISI) não invalida trial nenhum (correto) mas também não é quantificada em duração; `totalHiddenMs` computado e nunca usado.
17. **Reload/fechamento/atualização**: reload mid-assessment → R6 (in_progress zumbi; dados dos trials já persistidos sobrevivem — bom); fechamento idem; atualização de app com mudança de regra → recomposição silenciosa do baseline (P1-1). `beforeunload` não é tratado.

## 13. Plano incremental (resumo executável — detalhado em PLANO.md)

Fase A (P0): A1 direções de métrica + z nulo (P0-2/P0-3) · A2 fase do baseline + migração v3 (P0-1) · A3 merge no resume (P0-4) · A4 import endurecido (P0-5).
Fase B (P1): B1 guarda de status terminal + ESC pós-done (P1-11) · B2 zumbis→interrupted + Descartar honesto (P1-7/8) · B3 erro de persistência visível (P1-6) · B4 transparência do baseline: composição, n mínimo, MAD=0 explicado (P1-2/14) · B5 filtros de gráficos + demo guards (P1-5/12) · B6 unificação Corsi (P1-3) · B7 flags de dispositivo (P1-10) · B8 antecipações de ISI (P1-9, após spec).
Fase C (P2/P3): unidades, persist(), docs, código morto — fora do escopo desta missão salvo tempo disponível.
