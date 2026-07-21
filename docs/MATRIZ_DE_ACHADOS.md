# Matriz de Achados — Auditoria Científica v1

- **Versão auditada**: tag `v1.2.0-pre-validation` = commit `05ef727b4826ea92193ec0e2add40cd662eb1906`
- **Data da auditoria**: 2026-07-21
- **Método**: leitura integral do fluxo de dados + oráculo matemático independente
  (`validation-oracle/`, 40 verificações código × oráculo, todas conclusivas) +
  revisão de literatura primária.
- **Nenhuma correção foi implementada.** Cada linha traz a correção sugerida.

Severidade: P0 = resultado falso; P1 = compromete conclusões; P2 = limitação/fragilidade relevante; P3 = apresentação/dívida.
Confiança: alta = mecanismo verificado por execução ou leitura direta inequívoca; média = leitura + raciocínio; baixa = hipótese.

## Tabela consolidada

| ID | Sev | Teste(s) | Local | Achado (resumo) | Confiança | Evidência |
|----|-----|----------|-------|-----------------|-----------|-----------|
| AC-01 | P1 | taskswitch | [src/tests/taskswitch/index.ts:239](../src/tests/taskswitch/index.ts) e :338 | `mixingCostAccuracy = acc(repeat) − acc(pure)`: sinal oposto à convenção do próprio `switchCostAccuracy` (repeat − switch, positivo = pior). Com a direção registrada `-1`, uma melhora real (custo de mistura diminuindo) apareceria como piora se a métrica for interpretada com direção. | alta | Oráculo: teste "DIVERGÊNCIA DOCUMENTADA" em `oracle_vs_production.check.ts` confirma produção = −definição consistente |
| AC-02 | P1 | stroop, gonogo, sart, nback, taskswitch, corsi | [src/pages/Results.tsx:149](../src/pages/Results.tsx) | `customMetrics[primaryMetricKey] ?? rtMetrics.medianCorrectRT`: quando a métrica primária é `null` (ex.: Stroop sem RT válido em uma condição), o valor exibido como "Métrica principal" e o z são calculados com o **RT mediano** contra o **baseline da métrica primária** — comparação entre grandezas diferentes, z absurdo exibido com confiança. | alta | Leitura direta; cenário mínimo descrito na VALIDACAO_CIENTIFICA §5.2 |
| AC-03 | P2 | todos | [src/pages/Results.tsx:152-155](../src/pages/Results.tsx) | O painel de z não filtra `quality === 'invalid'`: sessão inválida (ex.: precisão ao acaso) ainda é comparada ao baseline e mostra "z = …". A sessão não contamina o baseline, mas o número é exibido. | alta | Leitura direta do fluxo |
| AC-04 | P2 | todos exceto gonogo | [src/utils/random.ts:1-7](../src/utils/random.ts) | `seededRandom` divide por `0xffffffff` e pode retornar exatamente `1.0` (estado `0xffffffff`, prob. 2⁻³² por sorteio) → `randomInt(0,3)` retorna 4; `COLORS[4]` = `undefined` (Stroop), posição inválida (n-back). O gerador do gonogo se protege com `randomUnit`; os demais não. | alta | Demonstrado em execução: harness "fronteira do gerador aleatório" |
| AC-05 | P2 | todos | [src/utils/frameMonitor.ts:65-72](../src/utils/frameMonitor.ts) | Onset carimbado após **2 rAF** depois do `setState`: o carimbo tende a cair ~1 frame (~16,7 ms a 60 Hz) depois da pintura provável → RT sistematicamente subestimado por constante próxima de um frame. Comparável dentro da mesma máquina/refresh; não entre máquinas. Sem medição externa (fotodiodo), o atraso real é desconhecido. | média | Leitura + literatura (Bridges et al. 2020, doi:10.7717/peerj.9414) |
| AC-06 | P2 | todos | [src/pages/TestFlow.tsx:381](../src/pages/TestFlow.tsx), [src/utils/device.ts:32](../src/utils/device.ts) | `refreshRateEstimate` nunca é populado (`estimateRefreshRate` é código morto) → `FrameMonitor` assume sempre 60 Hz. Em monitor de 120/144 Hz o limiar de jitter fica ~2× maior que o devido e frames perdidos passam sem flag. | alta | grep: nenhum chamador de `estimateRefreshRate` |
| AC-07 | P2 | todos (longitudinal) | [src/statistics/baseline.ts:46-49](../src/statistics/baseline.ts) | Janela de baseline **congelada para sempre** (posições 4–11 das elegíveis). Escolha documentada e defensável para detectar deriva, mas: (a) o baseline envelhece — ganhos tardios de prática, troca de hardware ou mudanças sazonais deslocam TODOS os z na mesma direção; (b) não há mecanismo de re-baseline sem nova `protocolVersion`. | alta | Leitura + confirmação pelo oráculo (janela posicional) |
| AC-08 | P2 | nback | [src/tests/nback/index.ts:167](../src/tests/nback/index.ts) | `accuracy1Back`/`accuracy2Back` são calculadas **só sobre os alvos** (equivalem à hit rate), mas rotuladas "Precisão 1-back/2-back". Um usuário que responde a tudo teria "precisão" 100% nesses cartões. Redundante com `hitRate` e enganosa como rótulo. | alta | Leitura de `scoreNBackByLevel` (usa `targetTrials`) |
| AC-09 | P2 | corsi | [src/tests/corsi/adaptive.ts:98-101](../src/tests/corsi/adaptive.ts) | Semântica das métricas: `maxSpan` é o span **para o qual se avançou**, mesmo que nunca executado com sucesso (2 acertos no span k ⇒ maxSpan = k+1); `confirmedSpan` exige apenas 1 acerto no nível. Internamente consistentes (oráculo bate), mas os rótulos "Amplitude máxima/confirmada" não explicam isso, e a definição difere do escore clássico (Kessels et al. 2000, doi:10.1207/S15324826AN0704_8: 2 tentativas por comprimento, sem regra de 2 acertos para subir). | alta | Oráculo `corsi_replay` + literatura |
| AC-10 | P2 | sart, simple_rt | [src/scoring/common.ts:108](../src/scoring/common.ts) | `postErrorSlowing` usa limiar fixo de 150 ms, ignorando a config do teste: no SART (antecipação = 100 ms) RTs válidos de 100–150 ms entram nas métricas de RT mas ficam fora do PES. Inconsistência interna pequena. | alta | Leitura direta |
| AC-11 | P2 | sart | [src/components/test/StimulusDisplay.tsx:124-133](../src/components/test/StimulusDisplay.tsx), [src/tests/sart/index.ts](../src/tests/sart/index.ts) | Desvios do protocolo canônico de Robertson et al. 1997 (doi:10.1016/S0028-3932(97)00015-8): dígito com tamanho de fonte FIXO (o original randomiza 5 tamanhos justamente para forçar processamento semântico), 252 trials em 6 blocos vs. 225 contínuos. Ainda é um SART reconhecível, mas é uma **versão modificada** — resultados não são comparáveis à literatura. | alta | Leitura + fonte primária |
| AC-12 | P2 | gonogo, sart, nback, stroop | [src/components/common/MetricTooltip.tsx:24](../src/components/common/MetricTooltip.tsx), [src/pages/Results.tsx:237](../src/pages/Results.tsx) e :298 | Formatação enganosa: d′ exibido com **0 casas decimais** e unidade " ms" no cartão principal ("2 ms"); `commissionErrorRate` (0–1) exibido cru sob rótulo "(%)" e com " ms" quando primário ("0,11 ms"); `stroopCostAccuracy` ganha " ms" (`includes('Cost')`). Nenhum cálculo errado — só apresentação, mas na métrica principal. | alta | Leitura das heurísticas de unidade/decimais |
| AC-13 | P2 | taskswitch | [src/tests/taskswitch/index.ts:80-81](../src/tests/taskswitch/index.ts) | Primeiro trial de cada bloco misto é rotulado `mixed_repeat` mesmo quando a tarefa muda em relação ao bloco anterior (`isSwitch = i > 0 && …`). A prática padrão é excluir o 1º trial do bloco de ambas as médias (Rogers & Monsell 1995, doi:10.1037/0096-3445.124.2.207). Contaminação leve e constante do custo de alternância. | alta | Leitura do gerador |
| AC-14 | P2 | todos | Arquitetura de timing ([TestRunner.tsx](../src/components/test/TestRunner.tsx), [timing.ts](../src/utils/timing.ts)) | Durações (fixação, ISI, estímulo de 250/500 ms) via `setTimeout`, não frame-locked: duração real do estímulo varia ±1 frame e não é registrada; latência de teclado/USB/SO não medida; `performance.now` tem granularidade reduzida pelo navegador (~0,1 ms Chrome). Precisão RELATIVA na mesma máquina é razoável; precisão absoluta é desconhecida sem chronometria externa (Bridges et al. 2020; Anwyl-Irvine et al. 2021, doi:10.3758/s13428-020-01501-5). | alta | Leitura + literatura |
| AC-15 | P3 | todos | [src/statistics/baseline.ts:34](../src/statistics/baseline.ts) | Ordenação do baseline GERAL sem desempate (`startedAt` apenas), enquanto a contextual desempata por `sessionId`. Duas sessões com timestamp idêntico podem trocar de posição entre leituras do IndexedDB e alterar a janela. Documentado no código como escolha deliberada (não deslocar janelas já consolidadas). | alta | Leitura + comentário no código |
| AC-16 | P3 | todos | [src/components/charts/chartSelectors.ts:22-43](../src/components/charts/chartSelectors.ts) | O gráfico longitudinal inclui sessões `valid_with_warnings` e com `insufficientPractice` que o baseline exclui — o gráfico e o z podem "discordar" sem aviso específico (há aviso só para inválidas e versões antigas). | alta | Leitura |
| AC-17 | P3 | — | [src/statistics/baseline.ts:12-13](../src/statistics/baseline.ts) | Ramo `insufficient_data` de `getBaselinePhase` é inalcançável (código morto). | alta | Leitura |
| AC-18 | P3 | — | [src/statistics/rtProcessing.ts:94](../src/statistics/rtProcessing.ts) | `invalidTrialCount` conta apenas trials **corretos** com RT invalidado — o nome sugere todos os inválidos. | alta | Leitura |
| AC-19 | P3 | corsi | [src/pages/Results.tsx:239](../src/pages/Results.tsx), [MetricTooltip.tsx:2](../src/components/common/MetricTooltip.tsx) | No Corsi, `medianCorrectRT` é o tempo de reprodução da sequência inteira, mas o cartão "RT mediano" e o tooltip usam a linguagem genérica de tempo de reação — semântica diferente sem explicação. | alta | Leitura |
| AC-20 | P3 | — | lint | 4 avisos oxlint (fast-refresh em AppContext; optional chaining inseguro em teste do Corsi); bundle único de 844 kB. | alta | Saída registrada de `npm run lint`/`npm run build` |

## Campos detalhados por achado (correção sugerida, impacto histórico)

Para cada achado: **Correção sugerida** (não implementada) · **Nova protocolVersion?** · **Afeta sessões históricas?** · **Reconstrução de baseline?** · **Exige experimento?**

- **AC-01** — Redefinir `mixingCostAccuracy = accPure − accRepeat` (ou manter fórmula e trocar direção para `+1`), com bump de `scoringVersion`. Protocolo: **não** (estímulos idênticos). Histórico: recomputável a partir dos trials (determinístico). Baseline: a métrica não está em `baselineMetricKeys`, então **não**. Experimento: não.
- **AC-02** — Remover o fallback `?? medianCorrectRT`; quando a métrica primária for `null`, exibir "indisponível" (o caminho `value_missing` de `evaluatePrimaryZ` já existe e faria isso sozinho). Protocolo: não. Histórico: nenhum dado gravado é afetado (o erro é só de exibição/interpretação). Baseline: não. Experimento: não.
- **AC-03** — Suprimir o painel de z (ou rotulá-lo "sessão inválida — comparação não interpretável") quando `quality === 'invalid'`. Protocolo: não. Histórico: não. Experimento: não.
- **AC-04** — Usar `min(random(), 1 − ε)` (como o gonogo já faz) dentro de `seededRandom` ou de `randomInt`. Protocolo: **tecnicamente muda sequências geradas** para 1 seed em 2³² — na prática nenhuma sessão histórica muda; bump de protocolVersion desnecessário, mas registrar no changelog. Experimento: não.
- **AC-05/AC-14** — Não corrigível por software puro: exigem validação externa de timing (fotodiodo/keybot) descrita no PLANO_DE_VALIDACAO_EMPIRICA. Enquanto isso, a interface não deve prometer precisão absoluta em ms — apenas comparabilidade intra-dispositivo.
- **AC-06** — Chamar `estimateRefreshRate()` na preparação da sessão e gravar em `deviceInfo.refreshRateEstimate`. Protocolo: não. Histórico: flags de frames de sessões antigas em monitores ≠60 Hz são menos confiáveis (aceitar como está).
- **AC-07** — Decisão de produto: (a) manter janela congelada e EXPLICITAR a idade do baseline na UI ("baseline formado entre X e Y"); ou (b) janela deslizante das últimas 8 elegíveis com aviso de recomputação. Qualquer mudança exige recomputação determinística e aviso ao usuário; **não** exige nova protocolVersion (não muda o instrumento), mas muda a interpretação de todos os z — tratar como `baselineVersion`.
- **AC-08** — Renomear rótulos para "Taxa de acertos (alvos) 1-back/2-back" ou calcular acurácia global por nível. Histórico: recomputável.
- **AC-09** — Manter fórmulas (internamente consistentes e replicadas pelo oráculo), mas: rotular `maxSpan` como "maior span tentado" e documentar a regra do `confirmedSpan` no tooltip. Comparação com normas de Kessels et al.: **proibida** (protocolo diferente).
- **AC-10** — Passar `cleaning.anticipationThresholdMs` a `postErrorSlowing`. Histórico: recomputável; efeito ínfimo.
- **AC-11** — Ou implementar variação de fonte (nova `protocolVersion` obrigatória — muda o estímulo), ou documentar permanentemente como "SART modificado (fonte fixa)" e nunca comparar com dados publicados.
- **AC-12/AC-19** — Tabela explícita de formato por métrica (casas decimais, unidade, ×100 para taxas) em vez de heurísticas por substring. Protocolo: não. Histórico: não.
- **AC-13** — Excluir o 1º trial de cada bloco misto de switch/repeat (condição própria `mixed_first`). Muda o scoring: bump de `scoringVersion`; recomputável; baseline de `switchCostRT` mudaria ligeiramente → recomputar baseline ao recomputar sessões.
- **AC-15** — Adicionar desempate por `sessionId` também ao baseline geral, com verificação prévia de que nenhuma janela histórica real muda (auditável com os dados do usuário).
- **AC-16** — Nota no gráfico ("inclui sessões com avisos/fora do baseline") ou marcador visual por qualidade.
- **AC-17/AC-18/AC-20** — Limpeza técnica sem impacto numérico.

## Divergências código × oráculo

| Área | Resultado |
|------|-----------|
| Estatística descritiva (10 conjuntos, incl. vazio/único/outlier) | idêntico ≤1e-9 |
| SDT/Hautus (8 casos, incl. perfeito, invertido, sem sinal/ruído) | idêntico ≤5e-4 (aprox. de Acklam vs. inv_cdf exata) |
| Limpeza de RT + acurácia (3 cenários) | idêntico |
| Custos Stroop/switch/mixing + degenerados | idêntico |
| Replay adaptativo do Corsi (4 cenários) | idêntico |
| Baseline: elegibilidade, fases, janelas, contextual, MAD 0, direção | idêntico |
| `mixingCostAccuracy` | **divergência confirmada de sinal** (AC-01) |
| `seededRandom` fronteira | **retorna 1.0; randomInt sai do intervalo** (AC-04) |
