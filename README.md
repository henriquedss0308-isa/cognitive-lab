# COGNITIVE LAB

**Seu laboratório cognitivo pessoal**

Aplicação web local-first para testes cognitivos padronizados, acompanhamento longitudinal e comparação com baseline pessoal.

## Decisões de arquitetura

| Decisão | Escolha | Motivo |
|---------|---------|--------|
| Framework | Vite + React + TypeScript | SPA rápida, offline após carregamento |
| Estilo | Tailwind CSS v4 | Utilitários, tema escuro científico |
| Gráficos | Recharts | Integração React, gráficos claros |
| Persistência | IndexedDB (idb) | Local-first, ensaios individuais |
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
├── tests/          # Definições dos 8 testes (gerador, scoring, instruções)
├── protocols/      # Versionamento (embutido nos testes)
├── scoring/        # Validação de sessão, scoring comum
├── statistics/     # Mediana, MAD, d', custos, baseline
├── storage/        # IndexedDB, export/import
├── charts/         # Visualizações Recharts
├── batteries/      # Baterias pré-definidas
├── demo/           # Dados de demonstração
├── components/     # UI (layout, test runner, métricas)
├── pages/          # Dashboard, catálogo, histórico, etc.
└── types/          # Tipos centrais
```

## Baseline pessoal

- Primeiras **3** sessões válidas: familiarização
- Próximas **8** sessões: construção do baseline
- Depois: monitoramento longitudinal
- Z-score robusto: `direction × (value - median) / (1.4826 × MAD)`

## Qualidade das sessões

Sessões marcadas como `valid`, `valid_with_warnings` ou `invalid`. Sessões inválidas são armazenadas mas não entram no baseline automaticamente.

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
- Importação de backup

## Limitações de timing (navegador)

O registro de tempo de reação em SPA web tem limites metodológicos inerentes:

- **`stimulusOnsetTimestamp`** usa duplo `requestAnimationFrame` após `setState` do estímulo — referência ao frame de pintura, não ao instante da chamada de render.
- Respostas antes do onset válido são registradas como **antecipação** (`beforeOnset`), sem RT.
- A janela de resposta só abre após o onset registrado; timeouts usam `waitCancellable` abortável.
- **`droppedFramesEstimate`** compara intervalos entre frames com o refresh estimado — é uma **estimativa**, não medição absoluta de frames perdidos.
- Perda de foco da aba, throttling em background, React Strict Mode (double mount em dev) e rerenders podem introduzir jitter; o motor usa `trialToken`, `AbortController` e remoção de listeners para evitar trials duplicados ou respostas residuais.
- Precisão sub-milissegundo não é garantida; comparar sessões apenas no mesmo dispositivo/navegador.

## Limitações conhecidas (v1)

- Sem backend/autenticação
- Continuar sessão interrompida: apenas Corsi (protocolo adaptativo com estado salvo); demais testes exigem reinício
- Baterias executam testes individualmente (sem fluxo contínuo automático)
- Correlações contextuais requerem ≥10 observações (preparado, UI básica)
- Comparação mobile/desktop registrada mas não normalizada

## Princípios

- **Não diagnostica** TDAH, transtornos, QI ou déficits clínicos
- **Não usa** percentis populacionais inventados
- **Sempre mostra** velocidade, precisão e variabilidade separadamente
- **Compara** apenas com baseline e histórico pessoal

## Licença

Uso pessoal e educacional.