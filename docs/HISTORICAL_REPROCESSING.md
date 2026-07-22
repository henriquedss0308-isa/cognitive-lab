# Reprocessamento histórico do Corsi

O fluxo possui duas ferramentas e duas fases deliberadamente separadas:

1. auditoria estritamente somente leitura;
2. geração opcional de uma nova cópia migrada, vinculada ao relatório aprovado.

A segunda fase nunca altera o backup de entrada e não transforma a CLI de
auditoria em ferramenta de escrita.

## Fase 1 — Auditoria dry-run

A auditoria examina, sem migrar dados, sessões Corsi gravadas com o scorer
legacy `sdt-hautus-1`. Ela chama diretamente o `scoreSession` atual exportado
por `src/tests/corsi` e propõe a identidade
`sdt-hautus-1;corsi-replay-1` apenas no relatório dry-run.

## Uso

Use uma cópia do backup e informe os dois caminhos explicitamente:

```powershell
npm run historical:dry-run -- `
  --input "C:\caminho\backup-copy.json" `
  --report "C:\caminho\corsi-audit-report.json" `
  --dry-run
```

Os três argumentos são obrigatórios. Esta versão não oferece modo de escrita,
aplicação ou migração. Qualquer opção adicional, como `--migrate`, `--write`,
`--apply` ou `--in-place`, é recusada.

O comando termina com código diferente de zero e não cria relatório quando os
argumentos, caminhos, JSON ou estrutura básica do backup são inválidos.

## Arquitetura

- `src/historical-reprocessing/corsiDryRun.ts`: núcleo puro de classificação,
  validação, replay e comparação. Não acessa disco, relógio, IndexedDB ou rede.
- `src/historical-reprocessing/canonical.ts`: serialização JSON estável usada
  nos hashes e comparações.
- `src/historical-reprocessing/types.ts`: contrato versionado do relatório.
- `scripts/historical-reprocessor.ts`: fronteira de terminal, leitura somente
  do input, SHA-256, verificação byte a byte e escrita do relatório explícito.
- `src/historical-reprocessing/corsiMigration.ts`: validação pura do vínculo
  com a auditoria, reconstrução do resultado persistido e invariantes de
  preservação do backup.
- `src/historical-reprocessing/migrationTypes.ts`: contrato do relatório de
  migração.
- `scripts/historical-migrator.ts`: CLI separada, promoção exclusiva de
  temporários completos, verificações pós-escrita e rollback.
- `scripts/typescript-loader.mjs`: resolve em memória os imports TypeScript já
  usados pelo aplicativo; não transpila para disco nem cria cache.

O núcleo recebe um hasher por injeção. A CLI fornece SHA-256 sobre a
serialização canônica, mantendo análise e efeitos de arquivo separados.

## Elegibilidade

Uma sessão só é candidata quando:

```text
testId === "corsi"
result.scoringVersion === "sdt-hautus-1"
```

Para ser reprocessável, a candidata também precisa estar concluída, usar o
protocolo Corsi atual, possuir `sessionId`, `startedAt`, `mode`, `deviceInfo` e
`flags` válidos, além de pelo menos um trial. `status: "completed"` é aceito
explicitamente; por compatibilidade histórica, `status` ausente também é
tratado como concluído. Qualquer outro valor explícito é recusado. As flags
`incomplete` da sessão ou do resultado sempre prevalecem e tornam a candidata
inelegível. Cada trial precisa conter os campos efetivamente usados pelo replay,
incluindo `trialIndex`, `expectedResponse` e `actualResponse`, além dos demais
campos necessários ao `scoreSession` e ao `buildBaseResult`.
`metadata.sequence` continua obrigatória como evidência auditável e nunca
substitui `expectedResponse`. Já `metadata.userResponse` e
`metadata.partialPositionsCorrect` não são requisitos históricos: o replay os
deriva de `expectedResponse` e `actualResponse`, sem fabricar ou injetar campos
nos trials.

São registradas como puladas, sem chamada ao scorer:

- sessões de outros testes;
- sessões Corsi sem resultado;
- Corsi sem `scoringVersion`;
- Corsi já em `sdt-hautus-1;corsi-replay-1`;
- Corsi com qualquer versão desconhecida.

Candidatas incompletas ou sem dados obrigatórios são registradas como não
reprocessáveis, com código e mensagem de motivo. Uma falha do scorer, uma
versão de saída inesperada ou uma mutação detectada nos trials também tornam a
sessão não reprocessável.

## Entradas preservadas no replay

O scorer recebe clones com o mesmo conteúdo persistido de:

- `trials`;
- `mode`;
- `deviceInfo`;
- `flags`.

Nenhum campo ausente é preenchido. O `checkIn` permanece intacto no backup em
memória, mas não é argumento de `scoreSession` no contrato atual do aplicativo;
portanto não é inventado nem injetado no scorer.

## Relatório

O JSON de saída tem `toolVersion: "1.0.0"` e contém:

- `generatedAt` e `dryRun: true`;
- tamanho do input, SHA-256 antes/depois e indicador `unchanged`;
- `version` e `exportedAt` do backup;
- totais de sessões, Corsi, candidatas, reprocessáveis, divergentes, idênticas,
  não reprocessáveis e puladas;
- `candidateSessions`, com identidade, elegibilidade, motivo, contagem de
  trials, resultados antigo/recalculado, deltas, campos alterados e hashes;
- `skippedSessions`, separado, com identidade mínima e motivo da exclusão.

Os resultados auditáveis incluem todos os grupos produzidos pelo scorer real:

- `quality`, `flags` e `flagMessages`;
- `rtMetrics` e `accuracyMetrics` (incluindo `correctCount`, `totalTrials` e
  `accuracy`);
- `conditionMetrics`, `blockMetrics` e `customMetrics` (incluindo `maxSpan`,
  `confirmedSpan`, `totalCorrectSequences`, `partialScore` e
  `partialScoreRate` no scorer atual);
- `sdtMetrics`, caso uma futura implementação Corsi real passe a produzi-lo.

`processedTrials`, `trials`, dados de dispositivo, check-in, timestamps e
identificadores internos do resultado não são copiados para a projeção. A
`scoringVersion` é exibida separadamente como `oldScoringVersion` e
`proposedScoringVersion`; ela não torna, por si só, uma sessão divergente.
Divergência significa alteração no conteúdo relevante produzido pelo scorer.

## Garantias de segurança

- Não há caminho hardcoded nem descoberta automática de Downloads.
- O input é aberto apenas para leitura e nunca é passado a APIs de persistência.
- Input e report iguais são recusados também quando aliases/symlinks já
  existentes resolvem para o mesmo arquivo.
- O diretório do report precisa existir; a ferramenta não cria diretórios.
- O input é lido novamente após a análise. O report só é escrito se os bytes
  permanecerem idênticos e os hashes antes/depois coincidirem.
- Somente o arquivo indicado por `--report` é escrito, por criação exclusiva.
  Se ele já existir, a execução aborta sem truncar ou modificar o conteúdo. Não
  existe opção `--force` nesta versão.
- A CLI não importa o repositório IndexedDB, não cria sessões e não contém
  código para gerar backup migrado.
- Outros testes são classificados como pulados antes de qualquer validação ou
  chamada de scorer.

## Determinismo e testes

As fixtures são sintéticas e ficam isoladas em diretórios temporários. A suíte
cobre backups sem Corsi, resultados idênticos e divergentes, versão já
corrigida, dados obrigatórios ausentes, versão ausente/desconhecida, sessão sem
resultado ou incompleta, JSON inválido, colisão de caminhos, imutabilidade do
input e dos trials, determinismo, isolamento de outros testes, ausência de
trials no report e obrigatoriedade de `--dry-run`.

O núcleo não consulta data ou hora. Duas análises do mesmo objeto produzem os
mesmos resultados, deltas e hashes. Somente `generatedAt`, acrescentado pela
CLI, depende do relógio atual.

## Limitações da auditoria dry-run

- Reprocessa somente Corsi `sdt-hautus-1` no protocolo suportado pelo scorer
  atual; não tenta converter versões desconhecidas.
- Carrega o JSON inteiro em memória; não há processamento por streaming.
- A fase de auditoria não gera backup migrado, patch, SQL, importação ou comando
  de aplicação.
- Não compara campos de persistência acrescentados ao redor do scorer, como
  `baselinePhase`, nem recalcula contexto longitudinal.
- Requer Node.js 24, usado pelo projeto para executar TypeScript com remoção
  nativa de tipos.
- O relatório contém IDs e métricas de sessões. Ele deve receber a mesma
  proteção do backup, embora não inclua os trials completos.

## Fase 2 — Geração de cópia migrada

Somente após revisar e aprovar o relatório da fase 1, execute a CLI separada:

```powershell
npm run historical:migrate -- `
  --input "C:\caminho\backup-copy.json" `
  --audit-report "C:\caminho\corsi-audit-report.json" `
  --output "C:\caminho\new-migrated-backup.json" `
  --migration-report "C:\caminho\new-migration-report.json" `
  --write-migrated-copy
```

Todos os argumentos são obrigatórios. Não existem opções `--force`,
`--overwrite` ou `--in-place`; opções desconhecidas são recusadas. `output` e
`migration-report` precisam ser caminhos novos e todos os quatro caminhos
precisam ser distintos, inclusive após normalização, resolução de symlinks e
comparação de arquivos existentes por identidade do filesystem.

### Vínculo com a auditoria

Antes de qualquer escrita, a fase 2:

- valida versão, estrutura e `dryRun: true` do relatório aprovado;
- confere tamanho e SHA-256 do input, os hashes antes/depois e `unchanged`;
- refaz a análise com o código atual;
- exige correspondência integral de backup, resumo, candidatas e sessões
  puladas, incluindo elegibilidade, versões, divergência e hashes;
- recusa qualquer candidata não reprocessável;
- recusa relatórios sem candidatas, evitando migração vazia silenciosa.

O resultado projetado do relatório nunca é persistido. Para cada candidata, o
scorer Corsi real é chamado novamente e sua saída completa recebe somente o
envelope persistido necessário (`sessionId`, timestamps, `isDemo` e campos
contextuais padronizados já existentes). Somente `session.result` é substituído.
Trials, sua ordem e seus campos permanecem intactos; nenhum campo é fabricado.

Sessões numericamente idênticas também são migradas para
`sdt-hautus-1;corsi-replay-1`. Sessões já atuais, outros testes e sessões não
aprovadas permanecem logicamente idênticos. A ordem das sessões, a estrutura
superior, `settings`, `exportedAt` e campos desconhecidos fora do resultado
substituído são preservados.

### Escrita e verificações

O output é serializado e validado integralmente em memória, gravado em um
temporário exclusivo no mesmo diretório e promovido por hard link exclusivo.
Assim, um caminho final preexistente nunca é truncado ou sobrescrito, e o nome
final só referencia bytes completos. Se uma etapa posterior falhar, arquivos
finais criados por aquela execução e temporários são removidos.

Após promover o output, a ferramenta:

- relê e valida o JSON e o SHA-256;
- confirma novamente os bytes e o hash do input e do relatório dry-run;
- refaz a auditoria sobre o output;
- exige zero candidatas legacy restantes;
- confirma totais de sessões/Corsi e a distribuição esperada de
  `scoringVersion`;
- confirma que nenhuma sessão fora do conjunto aprovado mudou.

O relatório de migração registra hashes e tamanhos dos três arquivos de
entrada/saída, hashes do input antes/depois, IDs e hashes completos dos
resultados migrados, deltas numéricos, sessões idênticas mas versionadas,
sessões puladas, distribuição Corsi e todas as verificações pós-escrita. Ele não
contém trials completos.

### Fora do escopo

A CLI apenas gera uma nova cópia JSON. Importar essa cópia no aplicativo é uma
etapa manual, posterior e fora do escopo. A ferramenta não acessa IndexedDB,
não cria sessões locais e não inicia importação automaticamente.

A fase 2 carrega o backup inteiro em memória e depende de suporte do filesystem
a hard links no diretório escolhido. Tanto o backup migrado quanto os dois
relatórios contêm dados sensíveis e devem ser protegidos adequadamente.
