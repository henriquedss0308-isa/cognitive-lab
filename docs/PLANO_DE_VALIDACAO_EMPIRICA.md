# Plano de Validação Empírica — Cognitive Lab

Este plano propõe estudos; **nenhum resultado é inventado aqui**. Ele assume a
versão `v1.2.0-pre-validation` com os achados P1 (AC-01, AC-02) corrigidos
antes de qualquer coleta formal — validar um instrumento com um erro de sinal
conhecido desperdiçaria dados.

Contexto inescapável: o instrumento é de uso pessoal (n = 1). Estudos de n = 1
podem estimar **estabilidade, efeito de prática, erro de medida e mudança
confiável do próprio usuário**, mas não validade de construto populacional nem
normas. As análises abaixo são desenhadas para esse limite.

## E1 — Estabilidade e efeito de prática

- **Desenho**: para cada teste, ≥ 20 sessões em condições padronizadas (E8),
  espaçadas ≥ 1 dia, registrando ordem da sessão.
- **Análise**: regressão (robusta) da métrica primária sobre log(ordem) —
  curva de prática esperada em RT e n-back (Collie et al. 2003,
  doi:10.1017/S1355617703930074); estimar em qual sessão a inclinação deixa de
  ser distinguível de 0 (IC 95%).
- **Critério de sucesso**: platô identificável; se o platô vier DEPOIS da 3ª
  sessão, a familiarização de 3 é insuficiente e o número deve ser revisto por
  teste (decisão pré-registrada, não ad hoc).

## E2 — Confiabilidade teste-reteste intraindividual

- **Desenho**: após o platô de E1, 10 pares de sessões no mesmo horário do dia,
  em dias distintos, mesmo dispositivo.
- **Análise**: correlação de Spearman entre pares e, principalmente,
  **coeficiente de variação intraindividual** e ICC(2,1) tratando sessões como
  medidas repetidas. Para custos (Stroop, switch), calcular também a
  confiabilidade split-half dentro da sessão (correlação par/ímpar com
  Spearman-Brown) — é onde a literatura prevê o problema (Hedge et al. 2018,
  doi:10.3758/s13428-017-0935-1).
- **Critério**: definir, por métrica, se ela é utilizável para monitoramento
  (ex.: split-half ≥ 0,7) ou deve ser rebaixada a exploratória na UI.

## E3 — Erro de medida e mudança confiável (RCI)

- **Desenho**: usar as sessões estáveis de E2.
- **Análise**: SEM = DP_intra × √(1 − r); mudança mínima detectável
  MDC95 = 1,96 × √2 × SEM (Jacobson & Truax 1991, doi:10.1037/0022-006X.59.1.12).
  Comparar o MDC95 com o que o z robusto atual chama de "desvio": calibrar o
  texto da UI para só destacar |Δ| > MDC95.
- **Entregável**: tabela por métrica: SEM, MDC95, e o |z| equivalente.

## E4 — Validação de timing (a única parte que exige hardware)

- **Desenho**: (a) fotodiodo/câmera de alta velocidade (≥ 240 fps) apontados à
  tela durante ~100 trials: medir atraso onset-carimbado → onset-físico e a
  duração real dos estímulos de 250/500 ms; (b) atuador/keybot (ou relé em
  tecla) com atraso conhecido: medir viés e jitter do RT registrado.
  Metodologia de referência: Bridges et al. 2020 (doi:10.7717/peerj.9414).
- **Critério**: viés sistemático estimado com IC; se o jitter (DP) do pipeline
  for < 10 ms, RTs relativos são defensáveis; reportar o viés absoluto na
  documentação em vez de "precisão de milissegundos".
- **Extensão**: repetir em 60 Hz vs. 120 Hz para quantificar AC-05/AC-06.

## E5 — Comparação externa (âncora, não norma)

- **Desenho**: rodar, no mesmo dia e hardware, o PVT-B público (Basner et al.
  2011) e um SART canônico (ex.: implementação de referência) ao lado dos
  testes análogos do Lab, 5 repetições.
- **Análise**: correlação de postos entre métricas análogas (RT mediano ↔ RT
  PVT; comissões SART Lab ↔ SART canônico). n pequeno ⇒ apenas sanidade
  direcional, pré-registrada como tal.

## E6 — Sensibilidade a manipulação conhecida (opcional, cautelosa)

- **Desenho**: manipulações benignas e reversíveis com efeito esperado
  conhecido: privação parcial de sono NÃO é recomendada sem orientação; usar
  cafeína habitual vs. ausência (com aprovação médica se relevante) ou horário
  do dia (manhã vs. noite), 5+ sessões por condição, ordem contrabalanceada.
- **Análise**: comparação das distribuições intra-condição vs. MDC95 de E3.
- **Aviso**: mesmo positivo, isso mostra sensibilidade A ALGO — não valida
  atribuição causal na vida real (sem cegamento).

## E7 — Baseline contextual (lisdexanfetamina)

- O sistema já separa referências por estado registrado. Para que a comparação
  "com vs. sem" tenha algum valor descritivo: registrar o estado em 100% das
  sessões (evitar `unknown`), manter horário-do-dia constante dentro de cada
  contexto, e só ler diferenças maiores que o MDC95 do teste. **Nunca**
  interpretar como efeito farmacológico — sem randomização nem cegamento, é
  associação confundida com hora, sono e rotina. Decisões de medicação
  pertencem ao médico prescritor.

## E8 — Condições padronizadas (pré-requisito de tudo)

Mesmo dispositivo, mesmo monitor e taxa de atualização, energia conectada,
modo não perturbe, navegador fixo e atualizado, zoom 100%, mesma cadeira/mesa,
mesmo horário ±1 h, check-in preenchido. O app já flagra dispositivo/foco/zoom;
o protocolo pessoal deve tratar flag = sessão de qualidade reduzida.

## Estatística geral

- Métricas robustas (mediana/MAD) como primárias, coerentes com o app;
- ICs por bootstrap quando a forma da distribuição for duvidosa;
- pré-registro simples (arquivo no repositório) de hipóteses e critérios ANTES
  de cada estudo; tudo versionado com `protocolVersion` congelada durante cada
  estudo — qualquer mudança de protocolo invalida a série em curso.

## Limitações de um estudo com um único usuário

Sem generalização para outras pessoas; confundimento inevitável entre tempo,
prática e estado; ausência de cegamento; múltiplas métricas ⇒ risco de leitura
seletiva (mitigar pré-registrando UMA métrica primária por teste); resultados
servem para calibrar o instrumento PARA ESTE usuário e para honestidade da UI —
não para alegações clínicas ou científicas gerais.
