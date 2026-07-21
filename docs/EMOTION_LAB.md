# Emotion Lab — V1

Funcionalidade interna do Cognitive Lab. Não é uma aplicação separada, não tem
banco próprio, servidor próprio nem repositório próprio.

---

## 1. Objetivo

Registrar, junto das condições de cada sessão cognitiva, duas coisas e só duas:

1. **como a pessoa relata estar se sentindo naquele momento**;
2. **como a pessoa percebe sua relação naquele momento**.

São dados **exclusivamente contextuais**. Eles existem para dar contexto à
leitura de uma sessão — nunca para medir, pontuar ou concluir algo.

### O que este registro NUNCA faz

| Não faz | Garantia |
|---|---|
| modificar trials | contexto vive em `checkIn`, escrito fora do fluxo de ensaios |
| alterar scoring ou métricas | nenhum caminho de scoring lê `checkIn` (§5) |
| alterar qualidade ou validade | `sessionValidation` não recebe o contexto |
| incluir/excluir sessões do baseline | `getValidAssessmentSessions` não lê `checkIn` |
| alterar o baseline | idem |
| produzir diagnóstico psicológico | linguagem descritiva, verificada por teste |
| afirmar objetivamente como a relação está | ver §5 |
| prever conflito, término ou intenção de outra pessoa | fora de escopo, §10 |

A garantia é **estrutural, não disciplinar**: o contexto está pendurado em um
campo que os módulos de pontuação sequer recebem. O tipo de `buildResult` chega
a omitir `checkIn` explicitamente da assinatura.

---

## 2. Modelo dos quatro quadrantes

As emoções são classificadas em dois eixos — **energia** (alta/baixa) e
**agradabilidade** (agradável/desagradável) — formando quatro quadrantes:

| Quadrante | Energia | Agradabilidade | Descrição exibida |
|---|---|---|---|
| `yellow` (Amarelo) | alta | agradável | Energia alta e agradável |
| `green` (Verde) | baixa | agradável | Energia baixa e agradável |
| `blue` (Azul) | baixa | desagradável | Energia baixa e desagradável |
| `red` (Vermelho) | alta | desagradável | Energia alta e desagradável |

A cor é uma **classificação visual e analítica**, derivada automaticamente da
emoção escolhida. Não é editável separadamente e **nunca é o único portador de
significado**: toda vez que uma cor aparece, o nome e a descrição textual do
quadrante aparecem junto. O ponto colorido é `aria-hidden` — quem usa leitor de
tela recebe o texto, não a cor.

As cores reutilizam tokens já existentes no tema (`--color-lab-warning`,
`--color-lab-success`, `--color-lab-accent`, `--color-lab-danger`), para não
introduzir uma paleta paralela.

---

## 3. Catálogo inicial

Fonte única: [`src/features/emotion-lab/emotionCatalog.ts`](../src/features/emotion-lab/emotionCatalog.ts).

| Amarelo | Verde | Azul | Vermelho |
|---|---|---|---|
| Alegre | Calmo | Triste | Ansioso |
| Animado | Tranquilo | Desanimado | Irritado |
| Entusiasmado | Confortável | Cansado | Estressado |
| Esperançoso | Satisfeito | Vazio | Frustrado |
| Empolgado | Seguro | Solitário | Preocupado |
| Energizado | Relaxado | Decepcionado | Agitado |

Cada definição tem `id`, `label`, `quadrant`, `pleasantness` e `energy`.

### Regra de identidade (importante para expansão)

O `id` é **estável e desacoplado do texto visível** (`anxious` ↔ "Ansioso").
Sessões gravadas referenciam o id, nunca o rótulo. Portanto:

- **pode**: reescrever qualquer `label` livremente — nada quebra;
- **pode**: acrescentar emoções novas com ids novos;
- **NÃO PODE**: renomear ou reaproveitar um `id` já publicado — isso
  reescreveria o passado de sessões já gravadas.

Um teste garante que nenhum `id` é simplesmente o rótulo em minúsculas, para
que a regra não se perca por descuido.

---

## 4. Escala da percepção relacional

Slider contínuo de **0 a 100**, com seis âncoras:

| Valor | Rótulo |
|---|---|
| 0 | Ruim |
| 20 | Paia |
| 40 | Meh |
| 60 | Ok |
| 80 | Boa |
| 100 | Muito boa |

Posições intermediárias são permitidas e recebem rótulo composto:

- exatamente 60 ⇒ **Ok**
- entre 60 e 80 ⇒ **Ok–Boa**
- exatamente 80 ⇒ **Boa**
- entre 80 e 100 ⇒ **Boa–Muito boa**

O valor numérico 0–100 é o que se persiste; a interface **prioriza o rótulo
qualitativo**, para não dar aparência de precisão científica a um autorrelato.

A conversão é uma função pura e determinística,
`relationshipRatingLabel(value)`, testada nas âncoras, nos intermediários, nos
limites e em entradas inválidas.

### Sem valor padrão silencioso

O campo é **opcional e não tem padrão**. O cursor do slider tem uma posição de
repouso visual (meio da escala), mas **nada é gravado enquanto a pessoa não
opera o controle** — até lá o texto ao lado diz "Não registrado" e o
`aria-valuetext` também. Gravar 50 ou 60 "de graça" faria parecer que houve
resposta onde não houve.

> Detalhe de implementação: clicar exatamente sobre a posição de repouso não
> altera o valor do input e por isso não dispara `change`. Sem tratamento
> explícito, seria impossível registrar justamente o meio da escala com um
> clique — daí o `onPointerUp` que confirma o valor quando ainda não há
> resposta. Pelo teclado não é necessário: a partir do repouso, toda tecla de
> operação altera o valor.

### Confiança na percepção

Campo opcional, cinco níveis: **Muito pouco · Pouco · Médio · Bastante ·
Muito**. Só aparece depois que existe uma percepção registrada.

Este campo **não invalida nem corrige** a percepção. Ele descreve apenas quanto
a pessoa confia na própria leitura naquele momento — é mais um dado de
contexto, não um fator de correção.

---

## 5. Percepção ≠ afirmação objetiva

Esta é a distinção central da funcionalidade.

O que fica registrado é **uma percepção relatada em um instante**, sujeita a
contexto, acontecimentos recentes, ansiedade, cansaço e outras emoções. Não é
uma medida do estado de uma relação, e não é a perspectiva da outra pessoa —
que a aplicação não tem como conhecer.

O formulário exibe esse enquadramento junto da pergunta, sem sugerir que a
percepção esteja certa ou errada:

> "Este registro representa sua percepção neste momento. Ela pode ser
> influenciada pelo contexto, acontecimentos recentes, ansiedade, cansaço ou
> outras emoções."

**Linguagem obrigatória na exibição** — sempre ancorada em quem relatou:

- ✅ "Você registrou sua percepção como: Ok–Boa"
- ✅ "Sua percepção naquele momento foi…"
- ✅ "Registro de percepção naquele momento, não uma avaliação da relação."

**Linguagem proibida:**

- ❌ "Sua relação está Ok–Boa."
- ❌ "A relação está piorando."
- ❌ "Sua ansiedade prejudicou sua percepção."

Há testes que falham se as frases proibidas — ou termos como *piorando*,
*tendência*, *risco*, *conflito*, *término*, *diagnóstico*, *score* —
aparecerem na tela de resultados.

---

## 6. Modelo de dados

Definido em [`src/features/emotion-lab/types.ts`](../src/features/emotion-lab/types.ts):

```ts
interface EmotionalContext {
  version: 1
  primaryEmotion?:   { emotionId: string; intensity: 1|2|3|4|5 }
  secondaryEmotion?: { emotionId: string; intensity: 1|2|3|4|5 }
  unidentifiedEmotion?: boolean
  relationshipPerception?: { rating: number; confidence?: 1|2|3|4|5 }
  updatedAt?: string
}
```

Vive em `TestConditions.emotionalContext`, ou seja, dentro do `checkIn` da
sessão (e do espelho em `result.checkIn`).

### Invariantes aplicadas no saneamento

| Regra | Comportamento |
|---|---|
| `rating` entre 0 e 100 | fora da faixa ⇒ percepção **descartada** |
| intensidades entre 1 e 5 (inteiras) | inválida ⇒ emoção descartada |
| `confidence` entre 1 e 5 | inválida ⇒ só a confiança some; a percepção fica |
| principal ≠ secundária | duplicada ⇒ secundária descartada |
| secundária exige principal | órfã ⇒ descartada |
| "não identificar" ⊕ emoção principal | não coexistem: a emoção nomeada vence |
| id desconhecido | tratado com segurança, nunca lança |
| campos ausentes | válidos — ausência é um estado, não um dado faltando |
| campos extras | descartados (lista branca) |

### Descartar em vez de "corrigir"

Um `rating` de 150 **não** é limitado a 100 na persistência. Limitar
fabricaria um autorrelato que a pessoa nunca deu — pior que a ausência do dado.
A persistência descarta; só a **exibição** é tolerante (limita às extremidades)
para que nenhuma tela quebre com dado importado à mão.

### `updatedAt`

Carimbado **apenas quando o conteúdo emocional/relacional muda**. Reabrir a
edição e salvar sem mexer nesses campos preserva o carimbo anterior.

---

## 7. Privacidade

- **Local-first**: tudo permanece no IndexedDB do dispositivo. Sem nuvem, sem
  login, sem sincronização.
- **Nenhum dado emocional vai para log ou console** — nem em mensagens de erro.
  A mensagem de falha ao salvar não inclui o conteúdo registrado.
- **Nenhum nome real** entra em código, fixtures, testes ou documentação. Onde
  um exemplo precisa de nome, usa-se um rótulo fictício.
- No código, os nomes são genéricos: `relationshipLabel`,
  `relationshipPerception`, `emotionalContext`.

### Rótulo da relação acompanhada

Campo local e opcional em **Dados e Configurações** ("Nome da pessoa ou relação
acompanhada"). Quando preenchido, a interface personaliza o texto de modo
discreto; quando vazio, tudo funciona com linguagem genérica.

Ele fica em `AppSettings` e, portanto, **faz parte do backup JSON** — a própria
tela avisa isso no campo.

---

## 8. Integração com backup

| Aspecto | Comportamento |
|---|---|
| Exportação | incluído no backup JSON, dentro de `sessions[].checkIn` |
| Importação | restaurado integralmente quando válido |
| Validação | saneado campo a campo na entrada |
| Backup antigo | importa normalmente; nenhum campo é inventado |
| Malformado | **nunca rejeita a sessão** — ver abaixo |
| Reimportação | `sessionId` já existente ⇒ ignorado; sem duplicação |
| Ida e volta | exportar → importar → exportar preserva o conteúdo |
| `relationshipLabel` | viaja em `settings` (aplicado só em banco local vazio) |

**Por que malformado não rejeita a sessão:** descartar os trials de uma sessão
inteira por causa de um campo contextual corrompido seria destrutivo. O
contexto inválido some, e trials, métricas e demais condições seguem intactos.

A área de dados exibe um aviso discreto de que backups podem conter contexto
emocional e relacional.

---

## 9. Compatibilidade retroativa

**Não houve migração de IndexedDB. `DB_VERSION` continua 3.**

Decisão deliberada: `emotionalContext` é uma propriedade **opcional aninhada**
em um objeto já existente. Não cria store, não cria índice e não muda a chave
de nenhum registro. Sessões gravadas antes da funcionalidade simplesmente não
têm o campo — o que o tipo já considera válido. Um bump de versão seria ruído
com risco de regressão e nenhum ganho.

Consequências verificadas por teste:

- sessão antiga sem `emotionalContext` continua válida e abre normalmente;
- sessão antiga sem `checkIn` nenhum continua válida;
- a tela de resultados não renderiza seção fantasma quando não há contexto;
- backup antigo importa sem ganhar campos inventados;
- scoring, métricas e composição do baseline permanecem idênticos.

---

## 10. Limitações da V1

- O registro é **por sessão cognitiva**: não há check-in emocional avulso.
- **Uma única relação acompanhada** — o rótulo é um campo simples.
- A escala relacional é **unidimensional**; não separa dimensões como
  proximidade, segurança ou conflito.
- O catálogo é **fechado nesta versão**: não há emoção personalizada pela
  interface (expandir exige editar o catálogo, que foi feito para isso).
- Não há nenhuma visualização histórica do contexto emocional — cada registro
  é lido na sessão a que pertence.
- O dado é **autorrelato de um instante** e carrega todos os limites disso.

---

## 11. Explicitamente fora do escopo

Não implementado nesta versão, por decisão:

- página independente do Emotion Lab;
- check-ins emocionais fora de uma sessão cognitiva;
- calendário emocional;
- gráficos emocionais;
- correlações entre emoção e cognição;
- score emocional;
- score de relacionamento;
- recomendações automáticas;
- IA interpretando sentimentos;
- alertas sobre a relação;
- nuvem, login ou sincronização;
- criptografia de backup;
- múltiplas relações acompanhadas.

Vários desses itens não são apenas "trabalho futuro": correlacionar emoção com
desempenho, pontuar uma relação ou emitir alertas contradiz o objetivo do
registro, que é contextual e não avaliativo.

---

## 12. Onde está o código

```
src/features/emotion-lab/
├── types.ts                    modelo de dados versionado
├── emotionCatalog.ts           catálogo único + quadrantes
├── relationshipScale.ts        âncoras, rótulo qualitativo, confiança
├── emotionalContext.ts         saneamento, comparação, updatedAt
├── components/
│   ├── EmotionalContextFields.tsx    formulário (pré-sessão e edição)
│   └── EmotionalContextSummary.tsx   exibição nos resultados
└── __tests__/                  catálogo, escala, saneamento,
                                persistência, repositório, interface
```

Pontos de integração (mudanças mínimas, sem refatorar áreas não relacionadas):

| Arquivo | Mudança |
|---|---|
| `src/types/index.ts` | `TestConditions.emotionalContext`, `AppSettings.relationshipLabel` |
| `src/components/test/TestConditionsForm.tsx` | seção do Emotion Lab + saneamento no submit |
| `src/pages/Results.tsx` | seção de contexto emocional + erro ao salvar |
| `src/pages/Settings.tsx` | rótulo da relação + aviso de backup |
| `src/pages/TestFlow.tsx` | repassa o rótulo ao formulário |
| `src/storage/export.ts` | saneamento na importação |
| `src/storage/repository.ts` | não reaproveita contexto da sessão anterior |
