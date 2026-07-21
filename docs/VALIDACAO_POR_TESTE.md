# Validação por Teste — Auditoria Científica v1

Versão auditada: `v1.2.0-pre-validation` (`05ef727b`). Oráculo: `validation-oracle/`.
Achados referenciados (AC-xx) estão detalhados em [MATRIZ_DE_ACHADOS.md](MATRIZ_DE_ACHADOS.md).

Classificação usada para cada métrica:
- **[T]** tecnicamente validada — implementação bate com o oráculo independente;
- **[M]** metodologicamente defensável — a fórmula/protocolo tem apoio na literatura;
- **[I]** escolha interna — decisão do projeto, sem consenso externo que a imponha;
- **[E]** exploratória — sem evidência suficiente; não interpretar isoladamente.

Fluxo comum a todos os testes (verificado): geração seedada → `TestRunner`
(fixação → ISI → estímulo → resposta/timeout) → `classifyTrialResponse` →
`buildTrialRecord` → persistência por trial (IndexedDB) → `scoreSession` →
`completeAssessmentSession` → baseline/z (`evaluatePrimaryZ`) → gráfico/texto.

---

## 1. simple_rt — Tempo de Reação Simples (`reaction.simple.v1.0`)

- **Protocolo**: 45 trials, 4 blocos, ISI uniforme 1000–3000 ms, resposta Espaço;
  prática 8. Limpeza: antecipação <150 ms, lapso >1500 ms. Janela de resposta 1500 ms.
- **Métrica principal**: `medianCorrectRT` (direção −1) **[T][M]**.
- **Secundárias**: rtCV **[T][M]**, lapseRate **[T][I]**, anticipationRate **[T][M]**,
  postErrorSlowing **[T][I]** (AC-10), isiEarlyPresses **[T][I]**.
- **Oráculo**: todas as estatísticas idênticas (≤1e-9).
- **Literatura**: paradigma clássico (Donders, 1868/1969). O análogo moderno de
  vigilância é o PVT (Basner & Dinges 2011, doi:10.1093/sleep/34.5.581), que usa
  **lapso >500 ms** e ~10 min; aqui o "lapso" é >1500 ms e a sessão dura ~4 min —
  a `lapseRate` deste protocolo NÃO é a métrica de lapsos do PVT e não herda a
  sensibilidade dele à privação de sono. RT simples tem boa confiabilidade
  teste-reteste (Deary, Liewald & Nissan 2011, doi:10.3758/s13428-010-0024-1).
- **Limitações**: RT absoluto carrega o atraso sistemático do pipeline (AC-05,
  AC-14); ISI mínimo de 1000 ms é mais curto que o do PVT (2–10 s), favorecendo
  respostas rítmicas/antecipatórias.
- **Linguagem permitida**: "seu RT mediano nesta sessão, comparado ao seu próprio
  histórico no mesmo dispositivo".
- **Linguagem proibida**: equivalência com PVT; "alerta"/"vigilância" como
  diagnóstico; comparação com normas populacionais.

## 2. choice_rt — TR de Escolha (`reaction.choice.v1.0`)

- **Protocolo**: 60 trials (30/30 esquerda-direita balanceados), 3 blocos, ISI
  800–2000 ms, teclas F/J; prática 10. Limpeza 150/2000 ms.
- **Métrica principal**: `medianCorrectRT` (−1) **[T][M]**. Secundárias: accuracy
  **[T]**, rtCV **[T]**, leftRightAsymmetry (|Δmedianas|) **[T][I]**,
  postErrorSlowing **[T][I]**.
- **Oráculo**: idêntico.
- **Literatura**: 2-choice RT clássico (Deary et al. 2011 usam 4-choice; a
  diferença TR escolha − TR simples reflete estágios decisórios — Donders).
  Balanceamento por embaralhamento de sequência com metade/metade é padrão.
- **Limitações**: `chanceAccuracy = 0.45` marca inválida uma sessão abaixo de
  45% (2 alternativas ⇒ acaso = 50%): critério levemente permissivo **[I]**.
- **Permitida**: velocidade de decisão comparada ao próprio histórico.
- **Proibida**: interpretar `leftRightAsymmetry` como lateralização cerebral.

## 3. stroop — Stroop de teclas (`stroop.standard.v1.0`)

- **Protocolo**: 120 trials (40 congruentes / 40 incongruentes / 40 neutros
  "++++"), 4 blocos, 4 cores × teclas F/G/H/J, ISI 500–1500 ms; prática 12.
- **Métrica principal**: `stroopCostRT = medianaRT(incongruente) −
  medianaRT(congruente)` (−1) **[T][M]**. Secundárias: stroopCostAccuracy
  **[T][M]**, incongruentNeutralCostRT **[T][M]**, accuracy **[T]**.
- **Oráculo**: idêntico, incluindo sessão completa sintética.
- **Literatura**: Stroop 1935 (doi:10.1037/h0054651); revisão MacLeod 1991
  (doi:10.1037/0033-2909.109.2.163). A versão de **resposta manual por teclas**
  produz efeito menor que a vocal, e o custo baseado em MEDIANAS por condição é
  escolha interna razoável **[I]**. Atenção: escores de diferença têm
  confiabilidade intrinsecamente baixa (Hedge, Powell & Sumner 2018,
  doi:10.3758/s13428-017-0935-1: ICC do custo Stroop ~0,6 com 2 sessões) —
  variações sessão a sessão do custo são esperadas mesmo sem mudança real.
- **Limitações**: proporção 1/3 congruente mantém o efeito, mas nenhum resultado
  aqui é comparável a versões vocais/de cartão; AC-02 pode exibir z falso se uma
  condição ficar sem RTs válidos.
- **Permitida**: "custo de interferência nesta sessão vs. seu histórico".
- **Proibida**: "controle inibitório clínico", comparação com Stroop de consultório.

## 4. gonogo — Go/No-Go (`gonogo.standard.v1.0`)

- **Protocolo**: 160 trials, 75% Go / 25% No-Go, máx. 4 Go consecutivos
  (sequência circular balanceada por bloco — geração verificada), ISI 800–2000 ms,
  janela 2000 ms; prática 16.
- **Métrica principal**: `dPrime` (+1) **[T][M]**. Secundárias: falseAlarmRate,
  hitRate, commissionErrorRate/commissionErrors **[T]**, criterion **[T][M]**,
  go.medianRT **[T]**.
- **Fórmulas**: d′ = z(H) − z(F), c = −(z(H)+z(F))/2 com correção log-linear de
  Hautus 1995 (doi:10.3758/BF03203619) aplicada sempre — recomendação do próprio
  artigo **[M]**. Normal inversa por aproximação de Acklam: erro < 5e-4 vs.
  oráculo exato — desprezível **[T]**.
- **Oráculo**: contagens (H/M/FA/CR), d′, critério e taxas idênticos na sessão
  sintética completa. Trials de antecipação ficam FORA de H+M (nem hit nem miss)
  — escolha interna consistente **[I]**.
- **Literatura**: proporção Go alta para gerar prepotência (Wessel 2018,
  doi:10.1111/psyp.13041); 75/25 está no intervalo usual. Go/No-Go mede inibição
  de ação distinta do stop-signal (Verbruggen & Logan 2008,
  doi:10.1016/j.tics.2008.07.005) — não estimar SSRT daqui.
- **Limitações**: com 40 No-Go, o teto efetivo de d′ (Hautus) ≈ 4,2; exibição do
  d′ com 0 casas decimais e " ms" (AC-12) esconde a resolução da própria métrica.
- **Permitida**: "capacidade de distinguir e reter resposta vs. seu histórico".
- **Proibida**: "impulsividade" como traço; equivalência com SSRT/CPT clínicos.

## 5. sart — SART (`sart.standard.v1.0`)

- **Protocolo**: 252 trials, 6 blocos, dígito 250 ms + máscara, SOA 1150 ms,
  No-Go = dígito "3" (11%), limpeza 100/900 ms; prática 18.
- **Métrica principal**: `commissionErrorRate` (−1) **[T][M]** — é a métrica
  original de Robertson et al. 1997 (doi:10.1016/S0028-3932(97)00015-8).
  Secundárias: medianCorrectRT, dPrime, postErrorSlowing, accuracy **[T]**.
- **Oráculo**: idêntico (contagens SDT, taxas, RT).
- **Divergências do protocolo canônico** (AC-11): fonte de tamanho fixo (o
  original randomiza 5 tamanhos), 252 vs. 225 trials, blocos com pausa vs.
  contínuo. É um **SART modificado**: as taxas de comissão típicas da literatura
  (~40–50%) não servem de régua.
- **Limitações**: velocidade-precisão fortemente acoplados no SART (RT mais
  rápido ⇒ mais comissões — Helton 2008); interpretar `commissionErrorRate`
  sempre junto do RT. 28 trials No-Go ⇒ granularidade de 3,6 pontos percentuais
  por erro.
- **Permitida**: "erros de inibição em tarefa monótona vs. seu histórico, junto
  com o RT".
- **Proibida**: "mind-wandering", "desatenção clínica", comparação com SART
  publicado.

## 6. nback — N-Back Espacial (`nback.spatial.v1.0`)

- **Protocolo**: avaliação = 80 trials 1-back + 100 trials 2-back (grade 3×3,
  estímulo 500 ms, SOA 3000 ms, ~27% alvos, controle de sequências ruins);
  prática 12 (1-back). Resposta só para alvo (Espaço).
- **Métrica principal**: `dPrime2Back` (+1) **[T][M]**. Secundárias: dPrime1Back,
  medianRT2Back, falseAlarmRate **[T]**; accuracy1Back/2Back **[T]** mas com
  rótulo enganoso (AC-08 — são hit rates de alvos).
- **Oráculo**: SDT por nível idêntico.
- **Literatura**: n-back espacial é paradigma consolidado de MT (Owen et al.
  2005, doi:10.1002/hbm.20131). Validade convergente com outras medidas de MT é
  **fraca** (Jaeggi et al. 2010, doi:10.1080/09658211003702171) — medir "memória
  de trabalho" com n-back é rótulo de domínio, não medida validada do construto.
  Um único bloco fixo 1-back→2-back confunde ordem com nível **[I]**.
- **Limitações**: 2-back com ~27 alvos ⇒ teto de d′ ≈ 4,3; efeitos de prática
  substanciais nas primeiras sessões são esperados (cobertos pela familiarização,
  mas não medidos).
- **Permitida**: "detecção de repetição espacial 2-back vs. seu histórico".
- **Proibida**: "capacidade de memória de trabalho" como construto validado;
  qualquer alegação de treino cognitivo.

## 7. corsi — Blocos de Corsi (`corsi.forward.v1.0`)

- **Protocolo adaptativo**: 9 blocos, span inicial 2, sobe após 2 acertos
  consecutivos no nível, termina após 2 erros seguidos no nível; apresentação
  600 ms aceso / 300 ms apagado; resposta por clique. Scoring por **replay**
  determinístico dos trials (fonte única das regras — verificado).
- **Métrica principal**: `confirmedSpan` (+1) **[T][I]** — maior span com ≥1
  sequência correta. Secundárias: maxSpan **[T]** (semântica peculiar — AC-09),
  totalCorrectSequences, partialScore(Rate) **[T][I]**.
- **Oráculo**: replay idêntico em todos os cenários (inclusive resposta curta
  correta-em-prefixo contada como erro).
- **Literatura**: Corsi clássico usa 2 tentativas por comprimento e para após 2
  falhas no mesmo comprimento (Kessels et al. 2000,
  doi:10.1207/S15324826AN0704_8) — a regra de subida "2 acertos consecutivos"
  daqui é diferente; produto span ×
  acertos e escore parcial têm análogos na literatura, mas ESTA combinação é
  interna **[I]**. Não comparar com normas.
- **Limitações**: sequências geradas com única restrição "sem repetição
  imediata" — path length/cruzamentos (que afetam dificuldade) não são
  controlados entre sessões; RT registrado é o tempo de reprodução total
  (AC-19). Span é métrica discreta (passos de 1) — z robusto sobre span tem
  granularidade grosseira e MAD 0 é provável (o caminho `zero_mad` existe e
  funciona — verificado no oráculo).
- **Permitida**: "amplitude visuoespacial nesta sessão vs. seu histórico".
- **Proibida**: "memória de trabalho normal/anormal"; equivalência com Corsi
  neuropsicológico de mesa.

## 8. taskswitch — Alternância (`taskswitch.standard.v1.0`)

- **Protocolo**: 160 trials = 40 puro-paridade + 40 puro-magnitude + 2×40 mistos
  (~50% switches aleatórios, cue = cor da borda simultânea ao estímulo), dígitos
  1–4/6–9, F/J; prática 12 (bloco puro).
- **Métrica principal**: `switchCostRT = medianaRT(switch) − medianaRT(repeat)`
  (−1) **[T][M]**. Secundárias: mixingCostRT **[T][M]**, switchCostAccuracy
  **[T][M]**, **mixingCostAccuracy [T mas com sinal invertido — AC-01]**,
  postErrorSlowing **[T][I]**.
- **Oráculo**: custos de RT e switchCostAccuracy idênticos; mixingCostAccuracy
  confirmado como o NEGATIVO da definição consistente.
- **Literatura**: switch/mixing costs canônicos (Monsell 2003,
  doi:10.1016/S1364-6613(03)00028-7; Kiesel et al. 2010, doi:10.1037/a0019842;
  Rogers & Monsell 1995, doi:10.1037/0096-3445.124.2.207). Cue simultâneo (CSI=0)
  produz custos grandes — legítimo, mas específico desta versão **[I]**.
  Escore de diferença ⇒ mesma ressalva de confiabilidade de Hedge et al. 2018.
- **Limitações**: 1º trial de bloco misto contado como repeat (AC-13); ordem
  fixa puro→misto confunde fadiga/prática com mixing cost **[I]**; blocos puros
  sempre na mesma ordem (paridade antes de magnitude).
- **Permitida**: "custo de alternar regras vs. seu histórico".
- **Proibida**: "flexibilidade cognitiva" como traço validado; mixingCostAccuracy
  não deve ser interpretada até o sinal ser corrigido.

---

## Sistema longitudinal (transversal aos testes)

- **Elegibilidade** (`getValidAssessmentSessions`): assessment + mesma
  protocolVersion + quality ≠ invalid + não-demo + completed + com result + sem
  insufficientPractice — **[T]** (oráculo: cenários com inelegíveis intercaladas).
- **Fases**: <3 familiarização; 3–10 construção; ≥11 monitoramento — **[T][I]**
  (o número 3+8 é escolha interna; a EXISTÊNCIA de familiarização é defensável
  por efeitos de prática — Collie et al. 2003, doi:10.1017/S1355617703930074).
- **Janela congelada** posições 4–11 — **[T]**, limitação AC-07.
- **Mediana/MAD, z robusto** com 1,4826·MAD — **[T][M]** (Leys et al. 2013,
  doi:10.1016/j.jesp.2013.03.013; Rousseeuw & Croux 1993). MIN_BASELINE_N=6 e
  supressão com MAD=0 — **[T][I]**, comportamento correto verificado.
- **Direção por métrica declarada** (sem heurística de nome) — **[T]**; única
  direção incoerente encontrada: AC-01.
- **Baseline contextual (lisdexanfetamina)** — **[T]**: familiarização global,
  janela = primeiras 8 elegíveis com status EXPLÍCITO, `unknown` nunca entra em
  contexto nenhum, fallback para a geral sempre sinalizado na UI
  (`ReferenceBadge`), mesma aritmética da geral (`computeMetricStats`
  compartilhado — verificado). A própria sessão é excluída do pool na tela de
  resultados — **[T]** por leitura. n=8 por contexto é escolha interna **[I]**;
  qualquer comparação "com vs. sem medicação" é **[E]** (observacional, sem
  cegamento, confundida com hora do dia/sono).
- **Gráficos**: 1 protocolVersion por série, inválidas fora com aviso, identidade
  por sessionId (sessões do mesmo dia distintas) — **[T]**; ressalva AC-16.
