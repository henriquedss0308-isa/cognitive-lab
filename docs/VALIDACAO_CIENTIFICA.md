# Validação Científica — Auditoria Independente v1

## 1. Escopo e versão auditada

- **Objeto**: Cognitive Lab — bateria pessoal de 8 testes cognitivos com
  acompanhamento longitudinal individual (n = 1), local-first.
- **Versão congelada**: tag `v1.2.0-pre-validation` = commit
  `05ef727b4826ea92193ec0e2add40cd662eb1906`, branch de trabalho
  `audit/scientific-validation-v1`.
- **Data**: 2026-07-21.
- **Estado do software no início**: `npm test` 754/754 verdes (49 arquivos);
  `npx tsc -b` sem erros; `npm run lint` com 4 avisos; `npm run build` ok
  (bundle 844 kB). Esses comandos registram o estado, **não** provam correção
  metodológica — a prova independente é o oráculo abaixo.
- **Fora do escopo**: backup/exportação em profundidade, Emotion Lab (apenas
  confirmado que não entra em métrica alguma), acessibilidade, segurança.

## 2. Método

1. **Inventário** (Etapa A): leitura integral de `src/tests`, `src/engine`,
   `src/scoring`, `src/statistics`, `src/storage`, `src/features` e das telas
   que exibem números; rastreamento configuração → trial → scoring → baseline →
   z → texto.
2. **Oráculo independente** (Etapa B): reimplementação em Python
   (stdlib apenas) das definições matemáticas em `validation-oracle/oracle/`,
   com auto-teste de casos calculados à mão; fixtures sintéticas determinísticas
   (seed 2026); harness que executa as funções REAIS de `src/` sobre as mesmas
   fixtures e compara número a número (**40 verificações**). Nenhuma função de
   produção foi importada pelo oráculo; nenhum arquivo de produção foi alterado.
3. **Auditoria do longitudinal** (Etapa C), **do timing** (Etapa D),
   **literatura primária** (Etapa E) e **linguagem da interface** (Etapa F).

Reprodução: ver `validation-oracle/README.md`
(`python -m oracle.selftest`; `python make_fixtures.py`;
`npx vitest run --config validation-oracle/vitest.config.ts`).

## 3. Resultado geral

**A aritmética implementada corresponde às definições declaradas.** Em 38 das
40 verificações o código de produção reproduz o oráculo dentro de 1e-9 (5e-4
para d′, pela aproximação de normal inversa). As 2 divergências são reais e
viraram achados (AC-01, AC-04). Não foi encontrado nenhum caso de mediana, MAD,
z, d′, custo ou replay do Corsi calculado errado no caminho normal.

O sistema também acerta um conjunto de armadilhas clássicas que foram
explicitamente testadas: a própria sessão nunca entra na referência com que é
comparada; `unknown` de medicação nunca vira "não tomou"; valor ausente vira
`null` propagado (nunca 0); MAD 0 suprime o z em vez de dividir por zero;
protocolos diferentes não se misturam em baseline nem em gráfico; sessões demo
e inválidas ficam fora do baseline; fallback de referência contextual é
sinalizado na interface.

**Contagem de achados: 0 × P0 · 2 × P1 · 12 × P2 · 6 × P3** (detalhes e
correções sugeridas em [MATRIZ_DE_ACHADOS.md](MATRIZ_DE_ACHADOS.md)).

### Principais riscos (os dois P1)

- **AC-01 — `mixingCostAccuracy` com sinal invertido** (taskswitch): a fórmula
  `acc(repeat) − acc(pure)` tem convenção oposta à do `switchCostAccuracy`
  vizinho, e a direção registrada (−1) faz uma melhora real parecer piora se a
  métrica for lida com direção. Mitigação atual: ela NÃO está entre as métricas
  de baseline, então não alimenta z primário — o risco é interpretativo, no
  cartão "Métricas específicas". Confirmado por execução.
- **AC-02 — fallback de métrica primária cruzada** (tela de resultados):
  quando a métrica primária custom é `null`, o código exibe e padroniza o **RT
  mediano contra o baseline da métrica primária** — um z entre grandezas
  diferentes, apresentado com confiança. Requer sessão degenerada (ex.: Stroop
  sem nenhum RT válido incongruente) mas é um caminho de resultado falso.

## 4. Baseline e sistema longitudinal

Verificado independentemente (código × oráculo, cenários sintéticos):
elegibilidade, ordenação, separação por `testId`+`protocolVersion`,
familiarização (3), janela congelada (8), fases, mediana/MAD, z robusto com
direção, `MIN_BASELINE_N` = 6, MAD 0, métricas ausentes, referência contextual
com/sem lisdexanfetamina, `unknown`, fallback sinalizado, exclusão da própria
sessão. **Tudo se comporta como especificado.**

Limitações metodológicas (não bugs): a janela congelada envelhece sem
mecanismo de re-baseline (AC-07); 8 sessões dão um MAD instável — o z robusto é
honesto sobre isso via `MIN_BASELINE_N` e supressões, mas |z| entre 1 e 2 é
ruído esperável; o baseline contextual é observacional (sem randomização nem
cegamento), então diferenças entre referências "com/sem" medicação são
descritivas, jamais causais.

## 5. Timing e engine

Separação honesta do que se sabe:

- **Correção interna**: verificada. Máquina de estados com token por trial
  impede dupla contagem; respostas antes do onset viram antecipação sem RT;
  teclas em fixação/ISI são contadas à parte (`isiEarlyPresses`) sem gerar
  trial; timeout → omissão; perda de foco invalida o RT do trial e rebaixa a
  sessão; ESC tardio não rebaixa sessão concluída; falha de gravação interrompe
  com erro visível.
- **Precisão relativa (mesma máquina/navegador)**: razoável. Relógio
  `performance.now` monotônico; onset e resposta no mesmo referencial.
- **Precisão absoluta**: **desconhecida e não prometida**. O onset é carimbado
  2 rAF após o setState (AC-05) — offset sistemático da ordem de um frame; a
  duração real do estímulo (250/500 ms nominais) não é medida (AC-14); latência
  de teclado/SO não é medida; o monitor de frames assume 60 Hz fixos (AC-06).
  Literatura: mesmo ferramentas web maduras têm atrasos absolutos de dezenas de
  ms com boa precisão relativa (Bridges et al. 2020, doi:10.7717/peerj.9414;
  Anwyl-Irvine et al. 2021, doi:10.3758/s13428-020-01501-5).
- **Comparabilidade entre máquinas**: não garantida; o sistema já flagra
  dispositivo/método de entrada divergentes (verificado), o que é a mitigação
  correta.

Conclusão de timing: os RTs servem para comparação intraindividual no mesmo
hardware; não servem como medidas absolutas nem para comparação com literatura
sem calibração externa (plano na validação empírica).

## 6. Interpretação e linguagem da interface

A linguagem existente é, em geral, cuidadosa: "Não diagnostica TDAH,
transtornos cognitivos ou QI" (Intro e detalhe do teste); o painel de z diz
"comparado ao seu próprio baseline", explica n e avisos, e "diferenças pequenas
podem não ser significativas"; o badge de referência contextual "nunca afirma
que o medicamento melhorou ou piorou o desempenho". Classificação:

- **Tecnicamente validado** (pode afirmar): valores das métricas; z robusto vs.
  baseline pessoal com as regras declaradas; composição das referências.
- **Metodologicamente defensável**: uso de mediana/MAD; correção de Hautus;
  familiarização; custo Stroop/switch como diferenças de medianas.
- **Plausível, não validado**: que as métricas reflitam os DOMÍNIOS declarados
  (ex.: n-back ↔ "memória de trabalho" tem validade convergente fraca —
  Jaeggi et al. 2010); que z > 0 signifique "melhor" além da métrica em si.
- **Exploratório**: qualquer leitura de condições (sono, cafeína, emoção,
  medicação) contra desempenho; tendências com < ~10 pontos.
- **Inadequado hoje** (corrigir linguagem/formatação): d′ exibido como "2 ms"
  (AC-12); "Precisão 2-back" que é hit rate (AC-08); `commissionErrorRate` cru
  sob rótulo "%" (AC-12); z exibido para sessões inválidas (AC-03);
  `mixingCostAccuracy` (AC-01) não deve ser interpretada.

## 7. Respostas ao critério de honestidade

1. **O código calcula o que pretende calcular?** Sim, com as exceções AC-01 e
   AC-02 — confirmado por oráculo independente em 40 verificações.
2. **O que pretende calcular é matematicamente adequado?** Sim no núcleo
   (mediana/MAD/z robusto, d′ com Hautus, custos por diferença de medianas são
   escolhas com literatura). Escolhas internas legítimas mas não impostas por
   consenso: limiares de lapso, proporções, janelas, n=8, MIN_BASELINE_N=6,
   scoring do Corsi.
3. **O protocolo é metodologicamente defensável?** Como instrumento PESSOAL
   longitudinal, sim, com ressalvas: versões modificadas dos paradigmas
   (SART com fonte fixa; Corsi com regra própria; ordem fixa de blocos no task
   switching) impedem comparação com a literatura; escores de diferença têm
   confiabilidade limitada por natureza (Hedge et al. 2018).
4. **Já foi empiricamente demonstrado NESTE projeto?** **Não.** Não há, nos
   artefatos auditados, estimativa de confiabilidade teste-reteste, erro de
   medida, efeito de prática ou validação de timing com dados reais. Tudo o que
   está "validado" aqui é validação INTERNA (código ↔ definição).
5. **O que pode ser interpretado hoje?** Desvios grandes e persistentes
   (|z| ≥ ~2 em várias sessões consecutivas) da própria referência, no mesmo
   dispositivo, na mesma versão de protocolo — como sinal descritivo para
   investigar, não como conclusão.
6. **O que não pode ser interpretado?** Diagnóstico ou risco clínico; causa
   (medicação, sono, emoção); comparação com outras pessoas ou normas; sessões
   isoladas; métricas marcadas exploratórias; qualquer RT absoluto.

## 8. Conclusão

O Cognitive Lab, na versão auditada, é **internamente correto** (aritmética
reproduzida por oráculo independente), **reproduzível** (protocolos versionados,
geração seedada, scoring determinístico com replay) e **defensável como
instrumento pessoal longitudinal** — desde que os dois achados P1 sejam
corrigidos e a formatação enganosa (P2 de apresentação) ajustada.

Ele **não é um instrumento clínico validado**, e nada nesta auditoria o torna
um: validade de construto, confiabilidade e precisão de timing continuam não
demonstradas empiricamente. O caminho para sustentar afirmações mais fortes
está em [PLANO_DE_VALIDACAO_EMPIRICA.md](PLANO_DE_VALIDACAO_EMPIRICA.md).
