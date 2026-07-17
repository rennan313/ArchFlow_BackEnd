# Core Architecture Decisions

**Status**: CONGELADO — Sprint 0 (Core Architecture Alignment), 2026-07-15
**Escopo**: decisões que generalizam padrões originalmente registrados como específicos do módulo Financeiro (`FINANCIAL_ARCHITECTURE_DECISIONS.md`, ADR-001 a ADR-011) para **todo o Core do ArchFlow**. Este documento não substitui nem reescreve nenhuma decisão anterior — cada ADR aqui referencia explicitamente a decisão original que generaliza. Regra do CORE-10 respeitada: nenhuma decisão registrada foi alterada silenciosamente.

**Motivação**: a Release 1.0 (Finance Foundation) prometeu que "Financeiro não deverá ser um módulo especial" — este documento é onde essa promessa vira decisão formal para o resto do Core (Auth, Workspace, CRM, Propostas, Billing), a partir dos achados da Sprint 0 (`FINANCIAL_ARCHITECTURE_DECISIONS.md`, Anexo — Revisão de Consistência).

## Índice

| ADR | Título | Generaliza |
|---|---|---|
| [012](#adr-012--logging-estruturado-é-padrão-de-aplicação-não-só-do-financeiro) | Logging estruturado é padrão de aplicação, não só do Financeiro | ADR-010 |
| [013](#adr-013--withtransactionretry-é-obrigatório-para-toda-escrita-multi-coleção-em-qualquer-módulo) | `withTransactionRetry()` é obrigatório para toda escrita multi-coleção, em qualquer módulo | ADR-003 |
| [014](#adr-014--guardas-de-exclusão-segura-cobrem-toda-a-cadeia-de-conversão-de-negócio) | Guardas de exclusão segura cobrem toda a cadeia de conversão de negócio | ADR-008 |
| [015](#adr-015--workspace-first-vale-mesmo-sem-campo-direto-de-workspaceid) | Workspace-First vale mesmo sem campo direto de `workspaceId` | ADR-006 |
| [020](#adr-020--entity-lifecycle-arquivar-restaurar-cancelar-excluir-como-padrão-oficial) | Entity Lifecycle — Arquivar/Restaurar/Cancelar/Excluir como padrão oficial | ADR-008, ADR-010, ADR-014 |

---

## ADR-012 — Logging estruturado é padrão de aplicação, não só do Financeiro

**Problema**: a Sprint 0 encontrou três padrões de log parciais coexistindo sem unificação: o `correlationId`+`event` do Financeiro (ADR-010, explicitamente escopado só a esse módulo), um catálogo de eventos tipados mais antigo (`src/lib/events.ts`, sem correlação, com entradas de catálogo nunca emitidas) usado em Auth/IA, e chamadas de log em texto livre sem estrutura (`"[billing] ..."`) no módulo de Billing. Nenhum dos três cobria os campos mínimos que um engenheiro de plantão precisa para investigar um incidente: `event`, `correlationId`, `workspaceId`, `userId`, `timestamp`, `entity`, `entityId`, `duration`, `level`.

**Alternativas consideradas**:
- Manter os três padrões coexistindo, cada módulo escolhendo o que preferir — rejeitado; é exatamente a inconsistência que a Sprint 0 existe para eliminar.
- Adotar `events.ts` como padrão único (é o mais antigo, já usado em mais lugares) — rejeitado: não tem `correlationId`, e várias entradas do catálogo são código morto (nunca emitidas), sinal de que o padrão não estava sendo mantido ativamente.
- Migrar tudo para `AsyncLocalStorage` de request global antes de padronizar o formato do log — rejeitado por escopo: resolveria um problema adjacente (propagação automática) mas não o problema real desta sprint (formato inconsistente), e é uma peça de infraestrutura maior, mais apropriada a um ADR próprio se/quando o app precisar de rastreamento de request de ponta a ponta.

**Solução escolhida**: `src/lib/auditLog.ts` — uma única função `auditLog(fields)` que todo módulo chama para todo evento de domínio relevante (não para todo log da aplicação — logs operacionais/diagnósticos continuam como `logger.*` direto). Campos: `event` (obrigatório, snake_case, nunca renomeado depois de publicado), `correlationId` (propagado ou gerado), `workspaceId`, `userId`, `entity`, `entityId`, `duration`, `level` (`info`/`warn`/`error`, default `info`), `timestamp` (ISO, gerado sempre). Inclui um backstop automático que remove qualquer campo cuja CHAVE pareça sensível (senha, token, segredo, cartão) antes de logar — não substitui a disciplina de quem chama, mas fecha o caso de erro humano.

O módulo Financeiro foi migrado nesta sprint para usar `auditLog` em vez de chamadas `logger.*` diretas com objeto literal — eliminando a duplicação de "montar o objeto de contexto" que existia em cada call site.

**Justificativa**: um formato único, com correlação, é o que transforma "grep de texto livre" em "filtro estruturado" — a diferença entre depurar um incidente em minutos ou em horas, discutida originalmente só no contexto do Financeiro (ADR-010) mas válida para qualquer módulo que grava dinheiro, muda estado de assinatura, ou aceita convites de workspace.

**Impacto futuro**: todo módulo novo usa `auditLog`, nunca reimplementa seu próprio objeto de contexto de log. `src/lib/events.ts` fica marcado como padrão legado — não removido nesta sprint (migrar Auth/IA é fora do escopo de baixa complexidade do Sprint 0, ver Anexo de `FINANCIAL_ARCHITECTURE_DECISIONS.md`, achado C), mas nenhum código novo deve adotá-lo. Billing deve migrar seus logs de texto livre para `auditLog` na próxima vez que qualquer arquivo do webhook for tocado por outro motivo — não como uma migração isolada.

---

## ADR-013 — `withTransactionRetry()` é obrigatório para toda escrita multi-coleção, em qualquer módulo

**Problema**: a Sprint 0 encontrou duas escritas multi-coleção reais fora do Financeiro sem proteção de retry — `subscription.service.ts#changePlan` (2 coleções, disparada diretamente por um webhook de pagamento real do Mercado Pago) e `workspace.service.ts#acceptInvite` (2 coleções). Ambas usavam `$transaction` em forma de array (`$transaction([...])`), que sequer aceita um hook de retry — a única forma de adicionar retry é migrar para a forma de callback (`$transaction(tx => ...)`) primeiro. `proposal.service.ts#create` já usava forma de callback mas também não tinha o wrapper de retry.

**Alternativas consideradas**:
- Deixar como estava, aceitando o risco documentado — rejeitado para `changePlan` especificamente: é o único destes três casos disparado por um evento de pagamento real de produção, o mesmo tipo de gatilho que motivou a ADR-003 originalmente.
- Adicionar retry ad-hoc, específico de cada caller, em vez de reusar `withTransactionRetry` — rejeitado; duplicaria a lógica de backoff exponencial + detecção de erro transitório que já existe e já é testada.

**Solução escolhida**: as três funções foram migradas para `withTransactionRetry(() => prisma.$transaction(async (tx) => {...}), { context: {...} })`, idêntico ao padrão do Financeiro. Nenhuma das três precisou de uma `idempotencyKey` nova — `changePlan` é uma atribuição idempotente por natureza (setar plano/status para X converge ao mesmo estado, não acumula) e já é deduplicada uma camada acima pelo `PaymentEvent.externalId`; `acceptInvite` e `create` (proposta) não são escritas de dinheiro e não têm o mesmo risco de duplicação que motivou a ADR-002 para `Payment`.

**Justificativa**: a mesma exposição a `WriteConflict`/`TransientTransactionError` que a ADR-003 documentou para o Financeiro existe em qualquer escrita multi-coleção no MongoDB, independentemente do domínio — não há razão técnica para a proteção ser exclusiva do Financeiro.

**Impacto futuro**: `ENGINEERING_STANDARDS.md` §3 já formaliza isso como regra geral de repository/service. Toda escrita multi-coleção nova, em qualquer módulo (Compras incluído), usa `withTransactionRetry()` desde o primeiro commit — não é adicionado depois como correção.

---

## ADR-014 — Guardas de exclusão segura cobrem toda a cadeia de conversão de negócio

**Problema**: `Project`/`Client` já tinham exclusão física bloqueada quando há `FinancialDocument` vinculado (RC-2.3). Duas entidades a montante na mesma cadeia de conversão (Oportunidade → Proposta → Projeto) não tinham o guarda equivalente: excluir uma `Opportunity` já convertida em `Project`, ou uma `Proposal` já convertida, deixava a referência (`Project.opportunityId`/`Project.proposalId`) órfã — e esse `Project` pode ter, ele mesmo, histórico financeiro.

**Alternativas consideradas**:
- Bloquear exclusão de `Opportunity`/`Proposal` sempre que tiverem QUALQUER dado relacionado (mais restritivo) — rejeitado: excessivamente amplo, bloquearia exclusões legítimas de oportunidades/propostas que nunca avançaram a projeto.
- Bloquear só quando o `Project` gerado já tem histórico financeiro (checagem indireta, dois saltos) — rejeitado: mais frágil e mais lento (precisaria checar Project→FinancialDocument a partir de Opportunity/Proposal); a checagem direta e mais simples (existe um Project?) já é suficiente, porque o próprio `Project` já tem seu guarda contra exclusão quando tem histórico financeiro — empilhar os dois guardas dá a mesma garantia final.

**Solução escolhida**: `opportunityService.delete`/`proposalService.delete` agora verificam `projectRepository.findByOpportunityId`/`findByProposalId` antes de excluir fisicamente, lançando `OPPORTUNITY_HAS_PROJECT`/`PROPOSAL_HAS_PROJECT` — mesmo padrão do RC-2.3 (`hasDocumentsForProject`/`hasDocumentsForClient`), um nível acima na cadeia.

**Justificativa**: o princípio do ADR-008 ("nunca excluir histórico financeiro, arquivar sempre que possível") só é uma garantia real se valer em toda a cadeia que pode LEVAR a histórico financeiro, não só no ponto final dela. Uma oportunidade que já virou projeto é, transitivamente, um ponto de entrada para dinheiro real — mesmo que ela própria nunca tenha um `FinancialDocument` diretamente vinculado.

**Impacto futuro**: qualquer cadeia de conversão nova (ex.: Cotação → Pedido de Compra → `FinancialDocument`, no futuro módulo de Compras) aplica o mesmo raciocínio — antes de adicionar uma rota `DELETE` física a qualquer entidade que participa de uma cadeia de conversão, perguntar "essa cadeia pode chegar a dinheiro real, mesmo que não diretamente?".

---

## ADR-015 — Workspace-First vale mesmo sem campo direto de `workspaceId`

**Problema**: o ADR-006 original assume que toda entidade de domínio tem `workspaceId` como campo direto — verdadeiro para o Financeiro, mas não para `ProposalMedia`, `Briefing`, e `ProposalStatusHistory` (todos anteriores ao módulo Financeiro), que só têm um vínculo indireto via `proposalId`/`opportunityId`. A Sprint 0 encontrou três repositories (`media`, `briefing`, `status`) que filtravam só pelo id direto, confiando inteiramente na validação da camada de serviço/rota acima — o mesmo padrão de risco que a RC-3.7 já tinha corrigido dentro do Financeiro (`countChildren`, `findPaymentSumsByDirection`), mas nesses três casos sem alternativa óbvia porque o campo simplesmente não existe no schema.

**Alternativas consideradas**:
- Adicionar `workspaceId` como campo direto a `ProposalMedia`/`Briefing`/`ProposalStatusHistory` (migração de schema + backfill) — mais alinhado ao ADR-006 ao pé da letra, mas é uma mudança de schema+dados para um ganho marginal (essas três entidades nunca vão ter volume que justifique um índice composto próprio — media por proposta, brief por oportunidade, e histórico de status são sempre coleções pequenas por registro pai).
- Não fazer nada, manter a dependência só na validação da camada de serviço — rejeitado; é exatamente a lacuna de defesa em profundidade que a Sprint 0 existe para fechar.
- Filtrar via a relação com o pai (`proposal: { workspaceId }` / `opportunity: { workspaceId }`) diretamente na query, sem precisar do campo direto — a escolhida.

**Solução escolhida**: toda query de leitura (`findMany`/`findFirst`/`count`) e escrita em lote (`updateMany`/`deleteMany`) nesses três repositories agora inclui o filtro pela relação com o pai. Para os dois casos onde o Prisma exige `where` restrito a campo único (`findUnique`, `upsert`) — que não aceitam filtro de relação — o repository faz uma pré-checagem explícita do pai antes de escrever (`briefingRepository.upsert`, mesmo padrão já usado em `document.repository.ts#addVersion`, que chegou a essa solução de forma independente antes desta ADR formalizar o padrão).

**Justificativa**: o objetivo do ADR-006 nunca foi "todo modelo tem um campo chamado `workspaceId`" — é "toda consulta prova que o recurso pertence ao workspace do chamador, na própria consulta, sem depender só de quem chamou". Filtrar por relação atinge exatamente esse objetivo sem o custo de uma migração de schema para entidades que nunca vão precisar de um índice composto próprio nesse campo.

**Impacto futuro**: para qualquer entidade nova sem `workspaceId` direto (deveria ser raro — a maioria dos modelos novos deve seguir o ADR-006 literalmente), a regra é: (1) usar filtro por relação em toda leitura/escrita-em-lote, (2) para operações restritas a `where` único (`update`/`upsert`/`findUnique`), fazer uma pré-checagem explícita do pai antes de escrever — nunca pular a checagem só porque o Prisma não aceita o filtro direto na mesma chamada.

---

## ADR-020 — Entity Lifecycle: Arquivar/Restaurar/Cancelar/Excluir como padrão oficial

**Status**: `ACCEPTED` — 2026-07-17. **Breaking Change**: NÃO (aditivo — três campos novos por entidade, defaults preservam 100% do comportamento atual). **Supersedes**: os campos ad-hoc `isActive` (Supplier, BankAccount) e `isArchived` (SupplierCategory, CostCenter, FinancialCategory, ProposalTemplate, ProposalSection, ProposalBlock, ProposalNarrative), que existiam antes desta ADR com o mesmo propósito mas sem nome nem semântica compartilhada. **Superseded By**: nenhuma. **Review Required**: somente se um novo tipo de transição de ciclo de vida (além de Arquivar/Restaurar/Cancelar/Excluir) precisar ser introduzido. Numeração global (ADR-016 a ADR-018 vivem em `COMPRAS_ARCHITECTURE_DECISIONS.md`, ADR-019 em `FINANCIAL_ARCHITECTURE_DECISIONS.md` — ver `ARCHITECTURE_GOVERNANCE.md` §1).

### Problema

Antes desta ADR, cada módulo tinha inventado sua própria resposta para "como faço este registro parar de aparecer nas telas normais sem apagá-lo de verdade": `Client`/`Opportunity`/`Proposal`/`Project`/`Meeting`/`Document` já usavam um par `archived`/`archivedAt` (sem `archivedBy`, sem auditoria, sem tela de consulta); `Supplier`/`BankAccount` usavam `isActive: false`; `SupplierCategory`/`CostCenter`/`FinancialCategory`/`ProposalTemplate`/`ProposalSection`/`ProposalBlock`/`ProposalNarrative` usavam `isArchived: true`. Três nomes de campo, duas polaridades diferentes (`isActive:false` é o inverso lógico de `isArchived:true`), nenhum registro de quem arquivou, nenhuma tela para encontrar o que foi arquivado, e nenhum serviço central — cada `service.ts` reimplementava seu próprio `updateMany` de arquivamento, sem guarda de RBAC/workspace consistente e sem gerar evento de auditoria. Adicionalmente, `FinancialDocument`/`PurchaseOrder` já tinham um conceito de **Cancelamento** (`isCancelled`/`status: CANCELLED`) que preserva o registro mas encerra seu significado de negócio — um terceiro comportamento, distinto de ambos, sem nunca ter sido escrito ao lado dos outros dois para que a diferença ficasse explícita.

### Alternativas consideradas

- **Deixar cada módulo com seu próprio campo/nome** — rejeitada; é exatamente a inconsistência que motivou esta Sprint, e cada nome novo (`isHidden`, `isDisabled`, etc.) só pioraria a fragmentação para o próximo desenvolvedor.
- **Um único campo genérico `status: "ACTIVE" | "ARCHIVED" | "CANCELLED" | "DELETED"`** — rejeitada: colapsaria em um único enum dois eixos ortogonais (arquivamento é reversível e não tem opinião sobre o significado de negócio do registro; `status` de negócio — como `ProjectStatus`/`ProjectPhase`/`PurchaseOrderStatus` — já existe por entidade e tem sua própria máquina de estados). Um Cliente `status: INACTIVE` (estágio de CRM, editável livremente) e um Cliente arquivado (ação destrutiva reversível, via botão de exclusão) são conceitos completamente diferentes; um único campo `status` compartilhado forçaria escolher entre os dois na mesma transição, exatamente o erro que o comentário de schema em `Client.archived` (ADR pré-existente, ver linha do modelo) já registrava informalmente.
- **Cada módulo continuar arquivando por conta própria, só padronizando o NOME dos três campos** — resolveria a fragmentação de nomes, mas não a de comportamento: RBAC, auditoria e a checagem de integridade na restauração continuariam duplicados e divergentes entre módulos, o oposto do que a Parte 6 do brief pede ("cada módulo apenas delega, nunca duplica regras").
- **Três campos padronizados (`archived`/`archivedAt`/`archivedBy`) + um serviço central (`entityLifecycleService`) do qual todo módulo arquivável delega, e um enum de negócio (`status`/`isCancelled`) mantido inteiramente separado para Cancelamento** — a escolhida.

### Definições — nunca misturar estes cinco conceitos

| Conceito | Significa | Reversível? | Quem decide | Exemplo |
|---|---|---|---|---|
| **Archived** (`archived`/`archivedAt`/`archivedBy`) | O usuário escondeu o registro das telas normais através da ação de exclusão da UI — o registro continua existindo, íntegro, e pode ser trazido de volta. | Sim, via Restaurar. | Usuário com a permissão `delete:<entidade>` (ver RBAC abaixo). | Arquivar um Cliente que não é mais atendido. |
| **Cancelled** (`isCancelled` ou `status: CANCELLED`, por entidade) | O registro **em si** deixou de representar um compromisso de negócio ativo — não é sobre visibilidade na tela, é sobre o significado do registro. Um documento financeiro cancelado continua visível e consultável; só para de contar como dívida/receita ativa. | Não, por padrão (ver ADR-008/ADR-018 — cancelamento é terminal salvo exceção explícita da própria entidade). | O próprio Aggregate, através de sua regra de negócio específica (ex.: `FinancialDocument.cancel()`, `PurchaseOrder.cancel()`). | Cancelar um Pedido de Compra em `DRAFT`. |
| **Deleted** (exclusão física — `.delete()`/`.deleteMany()` real) | O registro deixa de existir no banco. Sem histórico, sem auditoria de conteúdo (só o evento de que a exclusão ocorreu). | Não, nunca. | Reservado — ver Parte 5/Regras abaixo; a resposta-padrão para qualquer entidade nova é "não". | Excluir um `PurchaseOrder` em `DRAFT` sem nenhum vínculo financeiro. |
| **Inactive** (`status: "INACTIVE"` como valor de um enum de negócio já existente, ex. `ClientStatus`) | Um valor de negócio comum, escolhido livremente pelo usuário, dentro da máquina de estados própria da entidade (pipeline de CRM). Não tem nenhuma relação com arquivamento. | Sim, trivialmente — é só outro valor de `status`. | Usuário com permissão de `update:<entidade>`, igual a qualquer outro valor de `status`. | Marcar um Cliente como `INACTIVE` no funil comercial, continuando 100% visível em todas as telas. |
| **Disabled** | Não é um padrão do domínio — não existe hoje como conceito de entidade no ArchFlow (a palavra aparece só como estado de UI de um botão/campo). Se um módulo futuro precisar de um interruptor binário de "ligado/desligado" sem significado de arquivamento nem de negócio (ex.: uma integração externa pausada temporariamente), esse é um campo `enabled: Boolean` próprio da entidade, não uma reinterpretação de `archived`. | Depende do campo. | Depende do módulo. | (Nenhum uso hoje — documentado para nunca ser confundido com os quatro acima.) |

A regra prática que elimina qualquer ambiguidade futura: **`archived` responde "isso deveria aparecer nas telas normais?"; o `status`/`isCancelled` de cada entidade responde "isso ainda representa um compromisso de negócio ativo?"**. As duas perguntas são sempre independentes — um registro pode estar `archived: false` e `status: CANCELLED` ao mesmo tempo (documento cancelado, mas ninguém o arquivou), ou `archived: true` e com um `status` de negócio que continua o que era antes de ser arquivado (o arquivamento nunca reescreve o `status`).

### Decisão

Toda entidade arquivável ganha exatamente três campos, aditivos:

```prisma
archived   Boolean   @default(false)
archivedAt DateTime?
archivedBy String?   @db.ObjectId
```

Nunca reutilizar `status`/`active`/`inactive`/`deleted`/`disabled` para este propósito — esses nomes já têm (ou podem vir a ter) um significado de negócio próprio por entidade, e um campo de arquivamento com identidade própria é o que impede a colisão.

Um serviço único, `src/services/entityLifecycle.service.ts` (`entityLifecycleService`), expõe quatro operações — `archive()`, `restore()`, `cancel()`, `delete()` — que todo módulo arquivável delega, nunca reimplementa:

- **`archive(opts)`** — `updateMany({ where: { id, workspaceId, archived: false }, data: { archived: true, archivedAt: now, archivedBy: userId } })`, executando primeiro `opts.guard?.()` (checagem específica da entidade — ex.: "não tem histórico financeiro vinculado") e emitindo `auditLog` com evento `<entidade>_archived`. Lança `ENTITY_ALREADY_ARCHIVED` se o registro já estava arquivado — arquivar não é idempotente por design (ver Anti-padrões).
- **`restore(opts)`** — o inverso, executando `opts.integrityCheck?.()` antes (ex.: "o Cliente-pai não pode estar arquivado" — `PARENT_ARCHIVED`) e emitindo `<entidade>_restored`. Lança `ENTITY_NOT_ARCHIVED` se o registro não estava arquivado.
- **`cancel(opts)`** — centraliza apenas o guarda + auditoria (`<entidade>_cancelled` ou `opts.eventSuffix`); os campos que representam "cancelado" continuam 100% específicos de cada entidade (`data: opts.data`), porque Cancelamento nunca teve um vocabulário comum entre módulos e não deveria ganhar um agora (ver Definições acima — forçar um "cancelado" genérico reabriria a mesma confusão que motivou não ter um `status` genérico).
- **`delete(opts)`** — exclusão física real, com `level: "warn"` no log (uma exclusão de verdade deve se destacar numa busca de log ao lado de arquivamentos/restaurações rotineiros). Reservado — ver regra abaixo.

Cada operação recebe o delegate Prisma do próprio model (`delegate: prisma.client`, `delegate: prisma.supplier`, etc.) — o serviço nunca conhece nenhum model especificamente, só as duas formas estruturais (`updateMany`/`deleteMany`) que precisa chamar. Isso é o que permite um único arquivo servir 15 entidades hoje e qualquer módulo futuro sem nunca precisar de um `if (entity === "X")`.

**Filtragem automática (Parte 9)**: `src/lib/prisma.ts` estende o client do Prisma (`$extends`) para injetar `where: { archived: false }` automaticamente em todo `findMany`/`count`/`aggregate`/`groupBy` de um model arquivável — mas só quando o chamador ainda não especificou `archived` no próprio `where`. Isso é o que permite toda tela normal ignorar registros arquivados sem nenhum código por tela, e é também exatamente o mecanismo que a futura tela de "Itens Arquivados" usa para pedir `archived: true` e receber exatamente isso, sem sofrer a injeção automática. A lista de models cobertos (`ARCHIVABLE_MODELS`) é uma allow-list explícita, não introspecção do schema — um campo chamado `archived` adicionado a um model por outro motivo nunca começa a ser filtrado silenciosamente.

### Regras do domínio

- **Quem pode arquivar/restaurar**: a mesma permissão que já protegia a exclusão daquela entidade (`delete:<entidade>` ou `manage:financial-settings`, conforme já mapeado por módulo) — restaurar é o inverso da mesma ação de nível destrutivo, não uma capacidade nova que precisa de sua própria entrada em `PERMISSIONS`.
- **Restaurar sempre valida integridade antes de reverter o campo** — nunca restaura um registro para um estado inconsistente. O caso coberto hoje: uma entidade cujo pai obrigatório (`Client`, no caso de `Project`/`Opportunity`/`Meeting`; opcionalmente `Client` no caso de `Proposal`; `FinancialCategory` pai no caso de subcategorias) está arquivado — a restauração é bloqueada com `PARENT_ARCHIVED` até o pai ser restaurado primeiro. A mensagem de erro é sempre específica o bastante para o usuário agir (`ENTITY_ALREADY_ARCHIVED`/`ENTITY_NOT_ARCHIVED`/`PARENT_ARCHIVED` são três causas de conflito diferentes, nunca um genérico "erro ao restaurar").
- **Exclusão física é a exceção, nunca o padrão**: por default, nenhuma entidade nova ganha uma rota de exclusão física. Uma entidade só pode ser fisicamente excluída quando (1) ela nunca pode ter acumulado histórico de negócio de terceiros apontando para ela, ou (2) esse histórico é comprovadamente impossível no estado em que a exclusão é permitida. Hoje, isso vale para exatamente um caso: `PurchaseOrder` em `status: DRAFT` (nunca teve um `FinancialDocument` vinculado — ADR-018 de Compras). Toda entidade com qualquer relação financeira possível (`Client`, `Project`, `Opportunity`, `Proposal`, `Supplier`, `BankAccount`, documentos e categorias financeiras) é arquivamento-apenas, para sempre — não é uma limitação temporária desta Sprint.
- **Confirmação dupla para exclusão física**: qualquer rota de exclusão física exige, na camada de apresentação, confirmação dupla (modal de confirmação + digitar o texto exato, ex. `EXCLUIR`) antes de a chamada ao backend ocorrer — o mesmo padrão já usado por `ConfirmDialog`/`typeToConfirmText` para remoção de membro de equipe e cancelamento de assinatura. O backend em si não pode ver "quantas vezes o usuário confirmou" — a dupla confirmação é uma garantia de UX, reforçada pela garantia de domínio equivalente (RBAC + estado exigido, ex. `DRAFT`).
- **Auditoria**: toda transição de lifecycle usa exclusivamente `auditLog` (ADR-012) — nunca um mecanismo paralelo. Eventos padronizados: `<entidade>_archived`, `<entidade>_restored`, `<entidade>_cancelled` (ou sufixo específico), `<entidade>_deleted` (nível `warn`).

### Aggregate

Nenhuma entidade perde a responsabilidade por seus próprios invariantes de negócio. `entityLifecycleService` não decide QUANDO uma entidade pode ser arquivada/cancelada/excluída — cada serviço de entidade continua sendo o único lugar que conhece suas próprias regras (ex.: `financialCategoryService.archive` ainda é quem sabe que uma categoria com filhos ativos não pode arquivar; `entityLifecycleService` só centraliza COMO a transição é executada — o `updateMany`/`deleteMany`, o carimbo de atribuição, e o evento de auditoria — depois que o guarda específico da entidade já decidiu que a transição é permitida. Mesmo espírito da ADR-019 (Persisted Authority): a entidade continua a única dona de seu próprio invariante; o serviço compartilhado só evita que 15 módulos reimplementem o mesmo `updateMany`.

### Dependências

Nenhuma nova direção de dependência entre bounded contexts é criada. `entityLifecycleService` é infraestrutura compartilhada (mesmo nível de `auditLog`, `withTransactionRetry`), não um módulo de domínio — todo módulo já importa infraestrutura compartilhada, e isso não viola a regra de dependência unidirecional entre Financeiro/Compras/CRM (`DOMAIN_GUIDE.md` §6), porque nenhum desses módulos passa a importar OUTRO módulo de domínio por causa desta ADR.

### Generalização

Testado contra a lista completa pedida — Compras, Contratos, Portal do Cliente, Integrações, Marketplace, IA, API, Importação — nenhum exige extensão do modelo:

- **Compras**: `PurchaseOrder`/`PurchaseOrderItem` já usam Cancelamento (`status: CANCELLED`, ADR-018) para seu próprio ciclo de vida em vez de arquivamento — correto, porque um pedido de compra é sempre um compromisso de negócio (Cancelled), nunca um "esconder da tela" (Archived); se Compras precisar futuramente de uma ação de "arquivar pedidos antigos já cancelados/entregues" (puramente de visibilidade, não de negócio), a primitiva `archived`/`archivedAt`/`archivedBy` se aplica sem alteração.
- **Contratos, Marketplace, Integrações, Portal do Cliente, IA, API, Importação**: qualquer entidade nova que precise de "esconder da tela, mas manter recuperável" usa a mesma tripla de campos e delega a `entityLifecycleService`; qualquer entidade que precise de "meu registro não representa mais um compromisso ativo" define seu próprio campo de negócio (`status`/booleano específico) e usa `entityLifecycleService.cancel()` apenas para a parte de guarda+auditoria — nunca reinventa nenhuma das duas partes.

### Tabela de comportamento (oficial)

| Ação | Quando usar | Reversível | Quem autoriza | Auditoria |
|---|---|---|---|---|
| Arquivar | Usuário clicou "excluir" numa entidade cujo domínio nunca perde histórico (todas as 15 entidades de hoje) | Sim (Restaurar) | `delete:<entidade>` | `<entidade>_archived` |
| Restaurar | Usuário quer um item de volta às telas normais | — | Mesma permissão de Arquivar | `<entidade>_restored` |
| Cancelar | O registro deixou de representar um compromisso de negócio ativo, mas deve continuar visível/consultável | Não, por padrão | Regra própria da entidade (ex. `delete:financial-documents`, `delete:purchase-orders`) | `<entidade>_cancelled` |
| Excluir (física) | Reservado a entidades sem nenhum histórico possível no estado permitido (hoje: `PurchaseOrder` em `DRAFT`) | Não, nunca | Mesma permissão + confirmação dupla (digitar `EXCLUIR`) | `<entidade>_deleted` (nível `warn`) |

### Anti-patterns — nunca implementar

- **Reutilizar `status`, `active`, `inactive`, `deleted` ou `disabled` para representar arquivamento.** Cada um desses nomes já carrega (ou pode vir a carregar) significado de negócio próprio por entidade — colidir os dois conceitos no mesmo campo é exatamente o bug que motivou o `Client.archived` original a ser desenhado como campo independente de `status`.
- **Um módulo reimplementar seu próprio `archive()`/`restore()` em vez de delegar a `entityLifecycleService`.** Reabre a fragmentação de RBAC/auditoria que esta ADR existe para fechar.
- **Tratar `archived: true` como sinônimo de imutável.** Não é — um registro arquivado continua sendo o mesmo registro; a única coisa que muda é que ele para de aparecer nas listagens normais e não pode ser editado diretamente (precisa ser restaurado primeiro, ver Parte 8 do brief).
- **Adicionar exclusão física a uma entidade nova "porque parece mais simples".** A pergunta-padrão é sempre "essa entidade pode algum dia ter algo de negócio de terceiros apontando para ela?" — se a resposta não é um "não" comprovável, a resposta é arquivamento.
- **Criar um segundo mecanismo de auditoria específico de lifecycle.** `auditLog` (ADR-012) já é o único padrão; um `LifecycleLog` paralelo duplicaria exatamente o que essa ADR já resolveu uma vez.
- **Deixar a tela de item arquivado permitir edição direta.** Editar sempre exige restaurar primeiro — evita que um registro escondido das telas normais receba mudanças que ninguém revisando o fluxo normal veria.

### Limites — o que esta ADR explicitamente não resolve

- **Múltiplos arquivamentos simultâneos por diferentes atores não geram histórico de "quem arquivou antes de quem"** — `archivedBy`/`archivedAt` guardam apenas o evento mais recente, o mesmo espírito de `updatedAt`. O rastro completo de idas-e-vindas fica no `auditLog`, não no registro em si.
- **Detecção proativa de itens arquivados há muito tempo sem revisão** não é uma garantia desta ADR — um relatório operacional futuro ("itens arquivados há mais de 1 ano"), não uma obrigação de domínio.
- **`Task`, `FollowUp`, `User` e `Workspace` não participam deste padrão.** `Task`/`FollowUp` não têm hoje nenhuma tela ou necessidade de "esconder e restaurar" — são encerrados via seu próprio campo de conclusão (`completed`) ou removidos fisicamente sem histórico de negócio a proteger (achado do RC/auditoria original, não alterado aqui). `User` não tem conceito de arquivamento — remoção de um usuário de um workspace já é modelada como desvinculação de membership (`workspaceService.removeUser`), não como lifecycle de um registro de domínio. `Workspace.active` existe no schema mas nunca é escrito por nenhum caminho hoje — permanece fora do escopo desta ADR até que exista um fluxo real de suspensão de workspace; não deve ser confundido com o padrão de entidade arquivável descrito aqui.
- **A migração de dados legados (`scripts/migrate-lifecycle-archive-fields.ts`)** foi escrita assumindo uma janela em que os campos antigos (`isActive`/`isArchived`) e os novos (`archived`/`archivedAt`/`archivedBy`) coexistiam no schema para permitir backfill seguro antes de remover os antigos. O schema desta Sprint já removeu os campos antigos diretamente — esse script fica registrado como dívida técnica (ver relatório da Sprint) e não deve ser executado contra o schema atual sem primeiro reintroduzir os campos legados temporariamente, ou reescrevê-lo para ler de um snapshot/backup anterior à migração de schema.

### Invariantes garantidas

1. Toda entidade arquivável tem exatamente `archived`/`archivedAt`/`archivedBy` — nunca um quarto campo concorrente para o mesmo propósito.
2. Arquivar nunca apaga dado nenhum — é sempre reversível via Restaurar.
3. Restaurar nunca deixa um registro em estado inconsistente — a checagem de integridade do pai é obrigatória quando aplicável.
4. Cancelar nunca é a mesma operação que Arquivar, mesmo quando ambos "escondem" um registro de um fluxo ativo — os dois têm significados de domínio diferentes e nunca compartilham campo.
5. Exclusão física é sempre a exceção documentada, nunca o comportamento padrão de uma entidade nova.
6. Toda transição de lifecycle gera exatamente um evento de auditoria via `auditLog` — nunca zero, nunca um mecanismo paralelo.
7. Toda consulta de listagem normal ignora registros arquivados sem precisar de código por tela — a filtragem é automática ao nível do client Prisma.

### Consequências — decisões futuras que passam a seguir esta ADR automaticamente

Nenhum módulo futuro (Compras, Contratos, Portal do Cliente, IA, Analytics, Integrações) precisa de uma ADR própria para decidir "como arquivar/restaurar/cancelar/excluir os registros que eu crio" — a resposta já está decidida aqui: usar `archived`/`archivedAt`/`archivedBy` + `entityLifecycleService` para arquivamento/restauração, um campo de negócio próprio + `entityLifecycleService.cancel()` para cancelamento, e nunca adicionar exclusão física sem primeiro provar que a entidade não pode ter histórico de terceiros apontando para ela.
