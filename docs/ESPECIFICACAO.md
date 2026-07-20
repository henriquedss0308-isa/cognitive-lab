# Especificação Normativa — Cognitive Lab

Versão 1.0 · 2026-07-19 · Normativa: em conflito entre documentos, ESTA especificação prevalece.
Palavras-chave: DEVE (obrigatório), NÃO DEVE (proibido), PODE (opcional).

Toda contagem de sessões nesta especificação é **por par (testId, protocolVersion)** e considera apenas **sessões elegíveis** (§2). "Sessão nº N" refere-se à posição 1-indexada na ordem crescente de `startedAt` dentro desse par.

---

## 1. Ciclo de vida e fases

### 1.1 Fases por contagem de sessões elegíveis anteriores

| Sessões elegíveis JÁ CONCLUÍDAS (n) | Fase da PRÓXIMA sessão | Rótulo gravado nela |
|---|---|---|
| 0, 1, 2 | familiarization (será a nº 1–3) | `familiarization` |
| 3 … 10 | baseline_building (será a nº 4–11) | `baseline_building` |
| ≥ 11 | monitoring (será a nº ≥ 12) | `monitoring` |

- `result.baselinePhase` DEVE ser calculado como `getBaselinePhase(n)` onde **n = contagem de elegíveis anteriores, excluindo a sessão corrente**, usando exatamente o filtro de elegibilidade de §2 (fonte única: `getValidAssessmentSessions`).
- Sessão inválida recebe o rótulo da fase em que *teria* caído; ela não incrementa n para as seguintes.
- O monitoramento (exibição de z-score) começa na sessão nº 12. A frase correta para documentação é: "as válidas 4–11 constroem o baseline; a partir da 12ª, monitoramento".

**Exemplo**: usuário tem 10 válidas de gonogo v1.0. A 11ª válida grava `baseline_building` e completa o baseline. A 12ª grava `monitoring` e é a primeira com z-score.

### 1.2 Familiarização
Sessões nº 1–3 NÃO DEVEM entrar no cálculo de mediana/MAD. DEVEM aparecer no histórico e nos gráficos (marcadas como familiarização quando o gráfico distinguir fases).

## 2. Elegibilidade para o baseline (tabela de decisão)

Uma sessão é **elegível** sse TODAS as linhas são verdadeiras:

| Critério | Valor exigido |
|---|---|
| mode | `assessment` |
| status | `completed` (ou legado sem status) |
| result | presente |
| completedAt | presente |
| quality | `valid` OU `valid_with_warnings` |
| isDemo | `false` |
| flags.insufficientPractice | ausente/false |
| protocolVersion | igual ao do baseline consultado |

- `valid_with_warnings` **ENTRA** no baseline (decisão: mediana/MAD são robustos; excluir criaria baseline enviesado para dias "perfeitos"). CONTRAPARTIDA OBRIGATÓRIA: toda exibição de baseline DEVE mostrar a composição — "N sessões (K com avisos)".
- `interrupted`, `abandoned`, `in_progress`, demo e treino NUNCA entram.

## 3. Construção, congelamento e referência móvel

### 3.1 Durante baseline_building (sessões 4–11)
- Referência provisória = mediana/MAD de TODAS as elegíveis nº 4..N até o momento ("referência móvel crescente").
- A UI PODE mostrar tendência, NÃO DEVE mostrar z-score.

### 3.2 Congelamento na entrada em monitoring
- O baseline consolidado é **por posição**: exatamente as elegíveis nº 4–11.
- Invariante de estabilidade: uma vez atingido monitoring, o conjunto das 8 sessões DEVE permanecer estável sob operações normais (novas sessões nunca o alteram, pois entram após a 11ª posição).
- Eventos que PODEM recompor a janela (import de sessões com `startedAt` anterior, exclusão de sessão do baseline): NÃO DEVEM ocorrer silenciosamente. O sistema DEVE detectar que a janela mudou (comparação de sessionIds da janela) e avisar o usuário na próxima consulta ("A composição do seu baseline mudou após importação").
  - Implementação mínima aceitável (v1): aviso derivado; snapshot persistido é evolução futura.
- Métrica por métrica: `{median, mad, n}` calculados sobre os valores não nulos das 8 sessões. Se n < 6 para uma métrica, o z-score dessa métrica DEVE ser suprimido com motivo ("dados insuficientes no baseline: n=4/8").

## 4. Monitoramento e interpretação de z

- z robusto: `z = direction × (valor − mediana) / (1.4826 × MAD)`.
- `direction` DEVE vir de tabela explícita por métrica (`metricDirections` na definição do teste). Convenção: **+1 = valor maior é melhor** (d′, span, accuracy, hitRate); **−1 = valor menor é melhor** (RTs, custos, taxas de erro/lapso/antecipação/CV). Assim, **z positivo sempre significa "melhor que o baseline"**.
- Pré-condições para exibir z (todas): fase monitoring · valor da métrica não nulo · MAD > 0 · n ≥ 6.
- MAD = 0 (≥50% dos valores idênticos): NÃO DEVE virar z (divisão degenerada). A UI DEVE dizer: "Variabilidade do baseline ≈ 0 nesta métrica; comparação por desvio indisponível — compare os valores diretamente." PODE exibir o delta bruto (valor − mediana).
- Faixas de leitura (linguagem não clínica): |z| < 1 "dentro da sua variação habitual"; 1 ≤ |z| < 2 "um pouco acima/abaixo do habitual"; |z| ≥ 2 "claramente acima/abaixo do habitual — considere as condições do dia". NÃO DEVE haver termos diagnósticos, percentis populacionais ou "score global".

## 5. Qualidade da sessão (tabela de decisão)

Ordem de avaliação: qualquer linha "invalid" vence; senão qualquer "warning" rebaixa; senão valid.

| Evento | Efeito |
|---|---|
| interrupted / abandoned / incomplete | **invalid** |
| validRTs < minValidTrials do protocolo | **invalid** |
| accuracy < chanceAccuracy | **invalid** |
| accuracy < minAccuracy/2 | **invalid** |
| anticipationRate > máx do protocolo | warning |
| omissionRate > máx do protocolo | warning |
| windowLostFocus / tabChanged | warning |
| differentDevice / differentInputMethod (vs baseline) | warning |
| droppedFrames excessivos | warning (não invalida) |
| insufficientPractice (dev) | não altera quality; **exclui do baseline** |

Estados proibidos: `in_progress` com quality definida (DEVE ser indeterminada até o scoring — na v1, o valor inicial gravado é ignorado por todos os consumidores e DEVE ser tratado como indeterminado); sessão terminal (`completed`) rebaixada por transição posterior (§8).

## 6. Compatibilidade de dispositivos e protocolos

- Cada sessão grava `deviceInfo` completo. Na conclusão, o sistema DEVE comparar `deviceType`+`inputMethod` com a **moda** das sessões do baseline (ou das anteriores, se em building): divergência ⇒ `flags.differentDevice`/`differentInputMethod` + warning. NÃO DEVE bloquear a sessão.
- Baseline NÃO É segmentado por dispositivo na v1; a mitigação é a sinalização + recomendação de ambiente constante (documentada).
- Protocolo: baseline é estritamente por `protocolVersion`. Mudou a versão ⇒ novo ciclo completo (3 familiarização + 8 baseline). A UI DEVE comunicar isso quando uma nova versão entrar em uso. Comparações entre versões NÃO DEVEM ser plotadas na mesma série sem distinção.
- `scoringVersion` fica congelado no resultado. Se o scoring mudar, sessões antigas NÃO são recalculadas; séries que misturam scoringVersions DEVEM anotar a fronteira.

## 7. Sessões interrompidas e recuperação

| Situação | Estado resultante | Ação disponível |
|---|---|---|
| ESC durante avaliação | `abandoned` + invalid + incomplete | Reiniciar |
| Navegação interna sai do teste | `interrupted` + invalid + incomplete | Corsi: continuar; fixos: reiniciar |
| Reload/fechar aba | fica `in_progress`; na PRÓXIMA inicialização do app, toda `in_progress` com idade > 10 min (ou de outra sessão de app) DEVE ser transicionada para `interrupted` | idem |
| "Descartar" na UI | NÃO DEVE deletar por padrão: arquiva como `abandoned` (dados preservados). Exclusão permanente é ação separada, explícita ("Excluir permanentemente") com confirmação | — |

- Resume (só protocolos adaptativos com `adaptiveState`): DEVE preservar `sessionId`, `randomizationSeed`, `startedAt`, `checkIn`, `batteryId/Position` e `deviceInfo` original; DEVE comparar dispositivo atual vs original e sinalizar divergência. Trials já gravados são imutáveis.
- Protocolos fixos NÃO DEVEM ser retomados (comprometeria a sequência seeded e as regras de bloco).

## 8. Transições de status (invariante)

```
in_progress → completed | abandoned | interrupted
interrupted → (resume) in_progress | abandoned
completed, abandoned = terminais para escrita de status
```
`updateSessionStatus` NÃO DEVE sobrescrever status terminal (`completed`/`abandoned`) — chamadas tardias são no-op logado.

## 9. Edição de condições da sessão

- Permitida a qualquer momento após conclusão; altera SOMENTE `checkIn` e `result.checkIn` (+ `recordedAt`).
- NÃO altera: trials, RTs, correção, métricas, quality, flags, duração, protocolo, contagem/composição do baseline.
- "Usar condições da sessão anterior" NÃO DEVE puxar condições de sessões demo.

## 10. Importação e exportação

- Export: backup JSON completo (sessions+settings, `version` do formato), CSVs derivados. Export nunca muta dados.
- Import DEVE ser: **(a) validado por sessão** — estrutura mínima tipada: `sessionId` string, `testId` ∈ enum, `mode` ∈ enum, `trials` array (cada trial com campos mínimos), `quality` ∈ enum (ausente ⇒ rejeita ou normaliza explícita e documentadamente), status ∈ enum/ausente; **(b) idempotente** — sessionId já existente ⇒ **skip** (política padrão "manter dados locais"); **(c) transparente** — relatório final {importadas, ignoradas (já existiam), rejeitadas (+motivo)}; **(d) não destrutivo** — settings do backup NÃO sobrescrevem os locais (v1: ignorar settings do backup, exceto quando o banco local está vazio); **(e) robusto** — JSON inválido ⇒ mensagem de erro, nenhum efeito.
- Sessões rejeitadas NÃO DEVEM impedir a importação das válidas (atomicidade por sessão, relatório por item).
- Import NÃO DEVE inserir silenciosamente sessões que recomporiam um baseline em monitoring (§3.2 — aviso obrigatório).

## 11. Métricas: mediana e MAD

- Mediana: valor central (média dos dois centrais em n par). MAD: mediana dos desvios absolutos. Constante 1.4826 aplicada só no z.
- Agregados DEVEM operar apenas sobre valores não nulos; n reportado é o de valores usados.
- NaN/±Infinity NUNCA são persistidos (sanitização em TODA escrita, incluindo updates parciais e import).
- Denominador zero ⇒ null (nunca 0 "fingido"), exceto taxas definidas como 0 em conjunto vazio quando semanticamente corretas (ex.: anticipationRate com 0 trials = 0).

## 12. Versionamento

- `protocolVersion` identifica: estímulos, proporções, nº de trials/blocos, janelas de resposta, regras de limpeza, regras adaptativas e layout (Corsi). **Qualquer mudança nesses itens EXIGE bump.**
- `scoringVersion` identifica o algoritmo de pontuação; bump não invalida sessões antigas (resultados congelados).
- `randomizationSeed` + `protocolVersion` DEVEM ser suficientes para regenerar a sequência de estímulos; trials gravados são a verificação independente.
- Formato de backup tem `version` própria; import verifica compatibilidade conhecida.

## 13. Corsi — regra única (normativa)

- Avanço: 2 acertos consecutivos no span atual ⇒ span+1 (máx 9). Acerto zera `errorsAtSpan`.
- Término: 2 erros no mesmo span **sem acerto intercalado** (regra do engine atual, mantida por compatibilidade com sessões já gravadas).
- `confirmedSpan` = maior span com **ao menos um acerto completo** (definição do engine; a exigência de "2 consecutivos" aplica-se ao AVANÇO, não à confirmação).
- O scoring DEVE derivar essas grandezas por **replay de `applyCorsiResult`** sobre os trials, nunca por reimplementação paralela. Instruções ao usuário DEVEM descrever exatamente estas regras.

## 14. Antecipações fora da janela (ISI)

- Pressionamentos durante fixação/ISI DEVEM ser contabilizados (contador por trial `earlyPressCount` em metadata + agregado de sessão), sem criar trial e sem RT.
- Alimentam `anticipationRate` estendida? NÃO na v1 (mudaria comparabilidade); ficam como métrica separada `isiEarlyPresses` e possível warning se excessivos. Documentar no README a distinção.

## 15. Linguagem da interface (não clínica)

- PROIBIDO: diagnóstico, nomes de transtornos como resultado, QI, percentil populacional, "normal/anormal", score agregado único.
- OBRIGATÓRIO: separar velocidade/precisão/variabilidade; sempre referenciar "seu próprio baseline"; incerteza explícita ("diferenças pequenas podem não ser significativas"); demo sempre rotulada; limitações de timing documentadas.
