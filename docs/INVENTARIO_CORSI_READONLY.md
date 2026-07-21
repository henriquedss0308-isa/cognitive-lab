# Inventário Corsi somente leitura

## Objetivo

`analysis-tools/corsi-history-inventory/inventory.py` é uma ferramenta local,
auditável e sem dependências externas para responder empiricamente ao achado
AG-01. Ela inventaria sessões Corsi de um backup JSON oficial do Cognitive Lab,
reproduz em memória os scorers histórico e atual e verifica se valores das duas
regras coexistem em referências ou gráficos reais da versão congelada.

A ferramenta **não corrige, migra, importa, regrava nem reprocessa o backup**.
O único arquivo criado é um novo relatório JSON, sempre fora do repositório e
sempre em caminho diferente do input.

## Ameaça investigada

O protocolo permaneceu `corsi.forward.v1.0`, mas o scoring mudou no commit
`478a8fb6e5e5e407160ae29622397733ee43047c` (20/07/2026):

- regra legacy: `result.scoringVersion = "sdt-hautus-1"`;
- regra current: `result.scoringVersion = "sdt-hautus-1;corsi-replay-1"`;
- métrica primária: `confirmedSpan`;
- campos essenciais verificados: `confirmedSpan`, `maxSpan`,
  `totalCorrectSequences`, `partialScore` e `partialScoreRate`.

O scorer legacy é a regra do blob histórico `478a8fb^`, cuja execução foi
validada pelo `replication-oracle/`. O scorer current reproduz o replay do engine
adaptativo introduzido em `478a8fb`. Ambos são implementados de forma autônoma
na ferramenta, sem importar código de produção em tempo de execução.

## Garantias de somente leitura

A ferramenta:

- exige um caminho absoluto para o input;
- abre o backup apenas com modos `rb` e `r`;
- recusa `output == input`, inclusive aliases detectáveis pelo sistema;
- recusa qualquer output dentro do repositório;
- recusa sobrescrever um relatório existente;
- calcula SHA-256 antes de carregar o JSON e novamente após a análise;
- não grava relatório se os hashes forem diferentes;
- nunca chama rename, move, delete, truncate ou escrita sobre o input;
- não cria arquivo temporário ao lado do backup;
- não chama a rede e usa somente a biblioteca padrão do Python;
- recusa envelope, versão, codificação, constantes não finitas, chaves
  duplicadas ou JSON desconhecidos com exit code diferente de zero;
- termina com `INPUT UNCHANGED: YES` em sucesso. Em falha, a mesma linha informa
  se a igualdade dos hashes pôde ser confirmada.

O programa não chama APIs para alterar timestamps. Alguns sistemas de arquivos
podem atualizar o horário de último acesso ao ler um arquivo; isso é controlado
pelo sistema operacional, não pela ferramenta. O conteúdo e o horário de
modificação não são alterados intencionalmente.

## Antes de executar

1. Mantenha o backup real fora do repositório.
2. Faça uma segunda cópia de segurança se esse for o único backup disponível.
3. Escolha um caminho novo e externo para o relatório.
4. Não mova nem edite o backup enquanto a ferramenta estiver rodando.

Não envie o backup para o repositório e não o use como fixture.

## Windows CMD

Execute a partir da raiz do repositório:

```bat
python analysis-tools\corsi-history-inventory\inventory.py ^
  --input "C:\Backups\cognitive-lab-backup.json" ^
  --output "C:\Backups\corsi-inventory-report.json"
```

## PowerShell

Execute a partir da raiz do repositório:

```powershell
python .\analysis-tools\corsi-history-inventory\inventory.py `
  --input "C:\Backups\cognitive-lab-backup.json" `
  --output "C:\Backups\corsi-inventory-report.json"
```

`--output` é opcional. Quando omitido, o nome padrão é
`<nome-do-backup>.corsi-inventory-report.json` na pasta externa do input. O
arquivo não pode existir previamente. Informar explicitamente o destino é
preferível para manter a trilha de auditoria clara.

## Saída curta do terminal

O terminal mostra apenas:

- hashes SHA-256 inicial e final;
- quantidades total e Corsi;
- contagens legacy/current/missing/unknown/malformed;
- quantidades rescoriável e divergente do rescore atual;
- mistura efetiva em baseline e no gráfico;
- classificação final;
- caminho do relatório;
- `INPUT UNCHANGED: YES/NO`.

Erros são enviados para stderr e retornam exit code `2`. Sucesso retorna `0`.

## Relatório JSON

O relatório é versionado por `toolVersion` e `reportSchemaVersion` e contém:

- `input`: hashes antes/depois e confirmação de igualdade;
- `historicalModel`: versões, commit de fronteira e métricas conhecidas;
- `summary`: contagens e indicadores agregados;
- `corsiSessions`: inventário pseudonimizado, sem trials brutos;
- `baselineAnalysis`: regras, janelas gerais e comparações efetivas;
- `trendAnalysis`: reprodução do seletor longitudinal;
- `questions`: respostas explícitas às dez perguntas da investigação;
- `classification`: código e justificativa objetiva;
- `warnings`: campos ausentes ou malformados, sem conteúdo bruto.

O identificador de sessão é `sha256(sessionId)` truncado para 12 caracteres. A
data é reduzida a `YYYY-MM-DD`; `chronologicalOrder` preserva a localização exata
da fronteira sem expor horário. O rescore inclui somente métricas e deltas.

## Baseline e tendência reproduzidos

A elegibilidade geral corresponde à versão congelada:

- `testId` e `protocolVersion` exatos;
- apenas `mode = assessment`;
- `quality != invalid`;
- não demo;
- status ausente ou `completed`;
- `completedAt` e `result` presentes;
- `flags.insufficientPractice` não verdadeiro;
- ordenação crescente por `startedAt`, estável em empates;
- três sessões de familiarização;
- janela congelada das oito sessões seguintes;
- fase `monitoring` somente a partir de 11 elegíveis;
- comparação primária somente com pelo menos `MIN_BASELINE_N = 6` valores.

O seletor de gráfico também é reproduzido: avaliação com resultado, não demo,
não inválida, protocolo da sessão válida mais recente e somente pontos com
`confirmedSpan` numérico.

A seleção contextual usada pela tela de resultados também é executada em
memória, incluindo janela contextual completa e fallback para a referência
geral. Por privacidade, o relatório não revela medicamento, status contextual,
tipo de referência contextual nem sua composição; registra apenas se a
comparação aconteceu e se usou valores de scoring incompatíveis.

## Interpretação das classificações

### `NO_REAL_IMPACT_FOUND`

Não foram encontradas sessões Corsi, só foi encontrada uma regra conhecida, ou
nenhuma referência/série efetiva misturou regras incompatíveis.

Depois: preserve o relatório fora do Git e revise os warnings. Não migre nem
reescreva o backup com base apenas nessa classificação; ela descreve o backup
analisado, não backups futuros.

### `POTENTIAL_HISTORICAL_RISK`

Há `scoringVersion` ausente/desconhecida, sessão malformada ou trials
insuficientes para uma determinação completa e segura.

Depois: preserve o backup e o relatório, confirme a proveniência do arquivo e
revise apenas os campos ausentes apontados. Não invente versão, não complete
trials manualmente e não migre dados.

### `CONFIRMED_HISTORICAL_MIXING`

Uma referência efetiva contém valores legacy/current, uma sessão current é
comparada com valores legacy, ou o gráfico longitudinal efetivamente plota as
duas regras.

Depois: interrompa interpretações longitudinais do Corsi e planeje uma etapa
separada, sobre cópia, com política de migração e trilha de auditoria. Não altere
o backup original, não recalcule silenciosamente e não combine as séries.

### `CONFIRMED_DIFFERENCE_WITHOUT_BASELINE_MIXING`

Os dois cohorts existem e o rescore confirma diferença, mas nenhuma referência
efetiva nem série plotada mistura os valores.

Depois: mantenha as séries separadas e preserve o relatório. Não conclua que é
seguro misturá-las no futuro e não faça migração sem uma etapa explicitamente
aprovada.

## Privacidade

O relatório não copia `settings`, nome, rótulo de relacionamento, notas,
medicação, sono, cafeína, emoção, comentários, respostas completas, trials
brutos, timestamps detalhados nem `sessionId` original. Campos desconhecidos do
backup não são despejados em erro, warning ou relatório.

**Nenhum relatório produzido por esta ferramenta deve ser commitado, pois pode
conter metadados do histórico pessoal.**

Os padrões locais em `analysis-tools/corsi-history-inventory/.gitignore` são uma
proteção adicional, não substituem a obrigação de guardar o relatório fora do
repositório.

## Limitações

- Suporta estritamente o envelope oficial `version: "1.0.0"` da versão
  congelada; versões futuras falham com segurança em vez de serem adivinhadas.
- Carrega o JSON inteiro em memória. Backups excepcionalmente grandes exigem
  memória proporcional ao arquivo.
- O hash confirma igualdade dos bytes durante a janela da análise; não torna o
  arquivo imutável antes ou depois da execução.
- A pseudonimização reduz exposição, mas o relatório ainda contém metadados
  cronológicos e deve permanecer privado.
- O inventário reproduz regras do software congelado; não é validação clínica
  nem recomendação médica.
- `metadata.span` ausente usa o fallback histórico real `START_SPAN = 2` e essa
  ocorrência fica declarada por sessão. Campos obrigatórios de replay ausentes
  impedem o rescore.
- A ferramenta não produz Markdown, não altera baseline, não gera backup novo e
  não implementa migração.

## Testes sintéticos

```powershell
python -m unittest discover -s analysis-tools/corsi-history-inventory/tests -v
```

As fixtures são construídas localmente em
`analysis-tools/corsi-history-inventory/tests/synthetic_fixtures.py` e cobrem os
12 cenários obrigatórios, além de privacidade, determinismo, contextualização,
`confirmedSpan`, `maxSpan`, familiarização, sessão inválida e
`MIN_BASELINE_N`. Nenhum teste procura ou abre um backup real.
