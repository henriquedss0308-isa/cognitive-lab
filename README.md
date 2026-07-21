# COGNITIVE LAB

**Seu laboratório cognitivo pessoal**

Aplicação web local-first para testes cognitivos padronizados, acompanhamento longitudinal e comparação com baseline pessoal.

## Decisões de arquitetura

| Decisão | Escolha | Motivo |
|---------|---------|--------|
| Framework | Vite + React + TypeScript | SPA rápida, offline após carregamento |
| Estilo | Tailwind CSS v4 | Utilitários, tema escuro científico |
| Gráficos | Recharts | Integração React, gráficos claros |
| Persistência | IndexedDB (idb) | Local-first; 1 registro por sessão com trials embutidos |
| Roteamento | React Router v7 | Navegação multi-página |
| Testes unitários | Vitest | Validação estatística e backup |
| Autenticação | Nenhuma (v1) | Arquitetura preparada para backend futuro |

## Testes implementados (MVP)

1. **Tempo de Reação Simples** — `reaction.simple.v1.0`
2. **Tempo de Reação de Escolha** — `reaction.choice.v1.0`
3. **Stroop** — `stroop.standard.v1.0`
4. **Go/No-Go** — `gonogo.standard.v1.0`
5. **SART** — `sart.standard.v1.0`
6. **N-back visual** — `nback.spatial.v1.0`
7. **Corsi Block-Tapping** — `corsi.forward.v1.0`
8. **Task Switching** — `taskswitch.standard.v1.0`

Cada teste possui **Modo Treino** (feedback imediato) e **Modo Avaliação** (sem feedback, entra no histórico).

## Estrutura do projeto

```
src/
├── tests/          # Definições dos 8 testes (gerador, scoring, instruções, versão de protocolo)
├── engine/         # Registro/classificação de trials, critério de treino
├── scoring/        # Validação de sessão, scoring comum, comparação de dispositivo
├── statistics/     # Mediana, MAD, d', custos, baseline, z-score
├── storage/        # IndexedDB, migrações, export/import, conclusão/recuperação de sessão
├── batteries/      # Baterias pré-definidas
├── demo/           # Dados de demonstração
├── features/       # Funcionalidades por domínio (emotion-lab: contexto emocional)
├── components/     # UI (layout, test runner, gráficos, métricas)
├── pages/          # Dashboard, catálogo, histórico, etc.
├── context/        # Estado global (sessões + configurações)
└── types/          # Tipos centrais

docs/               # AUDITORIA.md · ESPECIFICACAO.md (normativa) · PLANO.md · EMOTION_LAB.md
```

## Baseline pessoal

Contagem por teste **e por versão de protocolo** (regra normativa em `docs/ESPECIFICACAO.md`):

- Sessões elegíveis **1–3**: familiarização (não entram no baseline)
- Sessões elegíveis **4–11**: construção do baseline (janela posicional fixa de 8 sessões)
- A partir da **12ª**: monitoramento longitudinal (z-score exibido)
- Z-score robusto: `direction × (value − median) / (1.4826 × MAD)`, com **direção explícita por métrica** (`metricDirections`; z positivo = melhor que o habitual)
- O z só é exibido com fase de monitoramento, valor presente, **MAD > 0** e **n ≥ 6** valores no baseline; MAD = 0 mostra mediana e delta bruto com explicação
- Importar sessões anteriores às locais pode recompor a janela — o import avisa quando isso é possível

## Qualidade das sessões

Sessões marcadas como `valid`, `valid_with_warnings` ou `invalid`.
- `invalid` (incompleta, poucos trials válidos, precisão ao acaso, interrompida/abandonada): armazenada, nunca entra no baseline nem nas tendências.
- `valid_with_warnings` (perda de foco, troca de aba, dispositivo/entrada divergente do habitual, excesso de antecipações/omissões): **entra no baseline**, e a interface mostra a composição ("N sessões, K com avisos").
- Sessões demo e sem treino válido nunca entram no baseline.

## Contexto emocional (Emotion Lab)

Opcionalmente, cada sessão registra **como a pessoa relata estar se sentindo** e
**como percebe sua relação naquele momento** — emoção principal e secundária
(catálogo de 4 quadrantes, com intensidade 1–5) e uma percepção relacional de
0 a 100 exibida por rótulo qualitativo ("Ok–Boa"), com confiança opcional.

São dados **estritamente contextuais**: nenhum caminho de scoring, métrica,
qualidade ou elegibilidade de baseline lê `checkIn` — a separação é estrutural.
O registro é opcional, editável depois sem recalcular nada, e nunca produz
diagnóstico, score ou afirmação sobre o estado de uma relação.

Detalhes, invariantes e limites em `docs/EMOTION_LAB.md`.

## Como executar

```bash
cd cognitive-lab
npm install
npm run dev      # http://localhost:5173
npm run build    # build de produção
npm test         # testes automatizados
```

## Exportação de dados

Em **Dados e Configurações**:
- Backup JSON completo
- CSV de ensaios individuais
- CSV de resultados por sessão
- Importação de backup — **validada por sessão** (estrutura e enums), **idempotente** (sessão já existente é mantida, nunca sobrescrita) e com relatório de importadas/mantidas/rejeitadas; settings do backup só são aplicados em banco vazio

O backup JSON inclui as condições de cada sessão e, portanto, pode conter
**contexto emocional e relacional** (e o rótulo da relação, guardado nas
preferências). Contexto emocional malformado em um backup é saneado na
importação, sem rejeitar a sessão nem seus ensaios.

## Limitações de timing (navegador)

O registro de tempo de reação em SPA web tem limites metodológicos inerentes:

- **`stimulusOnsetTimestamp`** usa duplo `requestAnimationFrame` após `setState` do estímulo — referência ao frame de pintura, não ao instante da chamada de render.
- Respostas antes do onset válido são registradas como **antecipação** (`beforeOnset`), sem RT. Teclas de resposta pressionadas durante **fixação/ISI** são contadas separadamente (`isiEarlyPresses`, por trial em `metadata.earlyPressCount`) sem criar trial — não alteram `anticipationRate`.
- A janela de resposta só abre após o onset registrado; timeouts usam `waitCancellable` abortável.
- **`droppedFramesEstimate`** compara intervalos entre frames com o refresh estimado — é uma **estimativa**, não medição absoluta de frames perdidos.
- Perda de foco da aba, throttling em background, React Strict Mode (double mount em dev) e rerenders podem introduzir jitter; o motor usa `trialToken`, `AbortController` e remoção de listeners para evitar trials duplicados ou respostas residuais.
- Precisão sub-milissegundo não é garantida; comparar sessões apenas no mesmo dispositivo/navegador.

## Limitações conhecidas (v1)

- Sem backend/autenticação
- Continuar sessão interrompida: apenas Corsi (protocolo adaptativo com estado salvo); demais testes exigem reinício. Reload/fechamento de aba deixa a sessão `in_progress`; na próxima inicialização ela é arquivada como `interrupted`
- Baterias executam testes individualmente (sem fluxo contínuo automático; campos `batteryId`/rotação ainda não orquestrados)
- Correlações contextuais ainda não implementadas
- Comparação entre dispositivos/método de entrada é **sinalizada** (flag + aviso + `valid_with_warnings`), mas não normalizada
- 7 dos 8 testes exigem teclado físico (sem alvos de toque); Corsi aceita clique/toque

## Princípios

- **Não diagnostica** TDAH, transtornos, QI ou déficits clínicos
- **Não usa** percentis populacionais inventados
- **Sempre mostra** velocidade, precisão e variabilidade separadamente
- **Compara** apenas com baseline e histórico pessoal

## Licença

Uso pessoal e educacional.