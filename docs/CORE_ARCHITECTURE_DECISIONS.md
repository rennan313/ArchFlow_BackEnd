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
