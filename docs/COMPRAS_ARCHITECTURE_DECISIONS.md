# Compras Architecture Decisions

**Status**: Fase 1 (Fundação) — em desenvolvimento, 2026-07-16
**Escopo**: decisões arquiteturais do módulo Compras (`src/modules/purchasing/`), o primeiro módulo de produto construído sobre a fundação congelada do Financeiro (Release 1.0) e generalizada pelo Core (Sprint 0/1). Segue o formato e a numeração globais definidos em `ARCHITECTURE_GOVERNANCE.md` §1 — cada ADR abaixo é obrigatória antes do código correspondente, e nenhuma será reescrita silenciosamente depois de publicada.

Compras é o primeiro consumidor real de três regras que até aqui só existiam como texto antecipando o módulo: a regra de dependência unidirecional (`DOMAIN_GUIDE.md` §6, "Compras depende de Financeiro; Financeiro nunca depende de Compras"), e os dois exemplos nomeados em `FINANCIAL_ARCHITECTURE_DECISIONS.md` ADR-002/004 ("criar Pedido de Compra", "Pedido de Compra aprovado → gerar FinancialDocument").

## Índice

| ADR | Título | Status |
|---|---|---|
| [016](#adr-016--purchaseorderitem-é-coleção-própria-nunca-tipo-composto) | `PurchaseOrderItem` é coleção própria, nunca tipo composto | Ativo |
| [017](#adr-017--duas-mecânicas-de-idempotência-para-as-duas-operações-não-idempotentes-do-agregado) | Duas mecânicas de idempotência para as duas operações não-idempotentes do agregado | Ativo |
| [018](#adr-018--rbac-com-tier-de-aprovação-e-exclusão-terminal-uma-vez-aprovado) | RBAC com tier de aprovação, e exclusão terminal uma vez aprovado | Ativo |

---

## ADR-016 — `PurchaseOrderItem` é coleção própria, nunca tipo composto

**Problema**: um `PurchaseOrder` precisa de uma lista de itens (descrição, quantidade, preço unitário) — a pergunta é se isso é uma coleção MongoDB separada (como `Installment` é filha de `FinancialDocument`) ou um tipo composto/embutido do Prisma (`type X { ... }`, sem coleção própria, sem `id` nem índice individual).

**Alternativas consideradas**:
- Tipo composto/embutido do Prisma — mais direto de escrever (um array dentro do documento pai, sem `@relation`), mas é um recurso **nunca usado em nenhum lugar do schema atual** (confirmado por busca em `schema.prisma` — zero ocorrências de `type X {}` ou `Json[]` para dado estruturado). Introduzir um padrão novo do zero, sem precedente no codebase, numa Fase 1 que já tem risco suficiente (primeira automação financeira cross-módulo) não se paga.
- Coleção própria (`PurchaseOrderItem`, com `purchaseOrderId`+`workspaceId`, mesma forma de `Installment`) — mais verboso (uma migration/coleção a mais, um repository a mais para pensar), mas é **exatamente** o padrão já comprovado em produção pelo módulo de referência.

**Solução escolhida**: `PurchaseOrderItem` é uma coleção top-level, filha de `PurchaseOrder` via `purchaseOrderId`, criada sempre junto com o pai dentro da mesma transação (`onDelete: Cascade` no lado do Prisma, mas a exclusão física do pai nunca acontece fora de `DRAFT` — ver ADR-018). Estrutura idêntica em espírito a `Installment`: `workspaceId` direto, índice `[workspaceId, purchaseOrderId]`.

**Justificativa**: "copiar o padrão que já funciona" é uma escolha mais segura que "escolher o padrão tecnicamente mais elegante pela primeira vez" quando o primeiro já foi hardenado por três sprints de RC e o segundo nunca foi testado neste codebase. Itens de pedido de compra têm exatamente a mesma forma de uso que parcelas: sempre lidos junto com o pai, nunca consultados isoladamente entre pedidos — não há necessidade técnica que favoreça o tipo composto, só familiaridade de sintaxe.

**Impacto futuro**: se um módulo futuro (Obras, per roadmap, "materiais consumidos numa visita de obra podem referenciar itens de um PurchaseOrder") precisar referenciar um item individual por `id` (não só por pertencer a um pedido), a escolha por coleção própria já paga esse dividendo de graça — um tipo composto exigiria migrar para coleção própria primeiro.

---

## ADR-017 — Duas mecânicas de idempotência para as duas operações não-idempotentes do agregado

**Problema**: `PurchaseOrder` tem duas operações que não podem produzir efeito duplicado sob reenvio (F5, duplo clique, retry de rede) — `create()` e `approve()` — mas elas têm formas estruturalmente diferentes. `create()` é uma ação livremente repetível pelo mesmo usuário, sem nenhuma precondição natural que distinga "primeira tentativa" de "reenvio da mesma intenção" — exatamente a mesma classe de problema que motivou ADR-002 para `Payment`. `approve()` é uma transição de status contra um `id` já existente, com exatamente um destino final possível a partir de `DRAFT`.

**Alternativas consideradas**:
- Uma única mecânica (`idempotencyKey` gerada no cliente) para as duas operações, por uniformidade — é o que o texto de ADR-002 sugere ("todo módulo... usa o mesmo padrão"). Rejeitado para `approve()` especificamente: adicionaria uma chave gerada no cliente para uma operação que já tem uma precondição de banco suficiente (`status: "DRAFT"`) — chave redundante sem ganho de segurança, e mais um campo para o frontend gerenciar (`localStorage`) numa ação que é fundamentalmente "aprovar ESTE pedido", não "criar uma nova intenção".
- Nenhuma proteção em `approve()`, confiando só no botão desabilitado após o clique no frontend — rejeitado pela mesma razão do ADR-002 original: debounce de UI não fecha a janela de corrida sob rede real (duas abas, retry de transporte).
- CAS puro (`updateMany` com precondição de status) para `approve()`, chave de idempotência gerada no cliente para `create()` — a escolhida, tratando as duas operações pela sua forma real, não por uma regra única aplicada cegamente às duas.

**Solução escolhida**:

- **`create()`**: `PurchaseOrder.idempotencyKey String @unique`, gerada no cliente no momento da intenção do usuário (mesmo padrão de `getOrCreatePaymentIdempotencyKey`/`localStorage`, `src/lib/idempotencyKey.ts` do frontend), checada como a primeira operação dentro da transação, em toda tentativa — inclusive em retries do `withTransactionRetry` — mirror exato de `installment.repository.ts#registerPayment`. Um segundo `create()` com a mesma chave retorna o pedido já existente, nunca cria um duplicado.
- **`approve()`**: sem chave de idempotência própria. A garantia vem de um `updateMany({ where: { id, workspaceId, status: "DRAFT" }, data: { status: "APPROVED", version: { increment: 1 }, ... } })` dentro da mesma transação que cria o `FinancialDocument`/`Installment` resultante (via a extensão de `financialDocumentRepository.createWithInstallments` para aceitar um `tx` externo — ver corpo do módulo). Se `count === 0` (alguém já decidiu o destino deste pedido), o comportamento depende do estado atual: se já está `APPROVED` com `financialDocumentId` preenchido, a resposta é um **replay idempotente bem-sucedido** (retorna o pedido + o `FinancialDocument` já gerado, não um erro) — mesmo espírito do tratamento de `P2002` em `registerPayment`, que prefere devolver o resultado real a rejeitar um reenvio legítimo. Só lança `PURCHASE_ORDER_ALREADY_DECIDED` se o estado for `CANCELLED` (decisão diferente, conflito real) ou inesperado.
- **A automação não passa pelo gate `automationService.isEnabled()`**: `approve()` registra o efeito com `auditLog({ event: "purchase_order_approved", ... })` diretamente, não pelo mecanismo `AutomationKey`/`AutomationRun`. `isEnabled()`/`AUTOMATION_KEYS` existem para conveniências que um workspace pode desligar sem quebrar uma invariante de negócio (ex.: criar Projeto automaticamente ao aprovar uma Oportunidade é útil, mas opcional). Gerar o `FinancialDocument` correspondente a um pedido aprovado não é opcional — é a própria definição de "aprovado" neste domínio (um pedido aprovado sem lançamento financeiro correspondente seria um estado inconsistente, não uma automação desligada). Ver `DOMAIN_GUIDE.md` §4.1/§4.2 para a distinção formal entre os dois mecanismos — esta é uma aplicação direta dela, não uma exceção.

**Justificativa**: `create()` é estruturalmente idêntico ao problema que ADR-002 resolveu para `Payment` — ação repetível, sem id prévio, sem precondição natural — então reaplica a mesma solução. `approve()` é estruturalmente diferente — ação contra um id já existente, com exatamente um destino terminal possível — o que o torna uma "atribuição convergente" (linguagem do próprio `MODULE_CREATION_CHECKLIST.md` Q8: "a operação retentada é idempotente OU é uma atribuição convergente"), a segunda categoria explicitamente prevista como alternativa válida à chave de idempotência, não uma invenção nova deste módulo.

**Impacto futuro**: qualquer operação futura de Compras (ou de outro módulo) que seja uma transição de status contra um id existente com destino único (ex.: cancelamento) segue o padrão CAS de `approve()`; qualquer operação que crie uma entidade nova sem precondição de id segue o padrão de chave do lado de `create()`. A pergunta a fazer antes de escolher: "esta operação tem um id-alvo com um destino final único, ou está criando algo novo cada vez que roda?" — a resposta decide qual dos dois padrões se aplica, não uma regra única para "toda escrita não-idempotente".

---

## ADR-018 — RBAC com tier de aprovação, e exclusão terminal uma vez aprovado

**Problema**: preço pago a fornecedor é informação tão sensível quanto margem/lucro do escritório (o mesmo raciocínio que já tornou o Financeiro o único domínio sem `read:*` universal — ADR-007) — Compras precisa do mesmo tratamento, não herdar visibilidade universal por padrão. Separadamente: uma vez que um `PurchaseOrder` gera um `FinancialDocument`, ele passa a ter histórico financeiro vinculado — a mesma condição que, no Financeiro, bloqueia exclusão física (ADR-008).

**Alternativas consideradas**:
- Reaproveitar exatamente as permissões `*:financial-documents` para Compras (nenhuma permissão nova) — rejeitado: um pedido de compra e um lançamento financeiro são agregados diferentes: uma ARCHITECT sem acesso a lançar/editar Fornecedores hoje não deveria automaticamente poder aprovar compras só por ter `update:financial-documents`. Precisa de uma família própria.
- Inventar uma hierarquia de permissões nova, desenhada do zero para Compras — rejeitado: o mapa real do Financeiro (`rbac.ts:41-121`, verificado linha a linha, não de memória) já resolveu exatamente esta pergunta ("quem administra dinheiro do escritório vs. quem só registra"); reaproveitar a mesma distribuição por papel evita inventar uma segunda política de confiança para conceitos irmãos.
- Permitir cancelamento de um `PurchaseOrder` já `APPROVED` nesta fase, cascateando para cancelar o `FinancialDocument` gerado — rejeitado por escopo: a regra de cancelamento do `FinancialDocument` já é condicional ("bloqueado se já houver pagamento"), então cancelar um `PurchaseOrder` aprovado exigiria replicar/coordenar essa mesma regra a partir de outro módulo — complexidade real, não uma linha a mais. Adiado explicitamente, não construído por precaução.

**Solução escolhida**: nova família `view:purchase-orders`, `create:purchase-orders`, `update:purchase-orders`, `delete:purchase-orders`, `approve:purchase-orders`, distribuída pelo **mesmo padrão real** (não o padrão idealizado) do Financeiro:
- **ADMIN**: todas as cinco (mesmo tier que já tem as cinco equivalentes de `financial-documents`, incluindo o `approve:financial-documents` reservado — Compras é o primeiro módulo a de fato ativar um gate de aprovação).
- **ARCHITECT**: view/create/update/delete (mirror de `rbac.ts:80`, que dá `delete:financial-documents` a ARCHITECT — "delete" aqui é sempre soft/reversível antes de `APPROVED`, nunca perda de histórico real). Sem `approve` — mesmo tier que já nega `approve:financial-documents` a ARCHITECT (`rbac.ts:82-84`).
- **ASSISTANT**: view/create/update (mirror de `rbac.ts:114`, que dá `update:financial-documents` a ASSISTANT mas não `delete`). Sem `delete`, sem `approve`.
- **DESIGNER/VIEWER**: nenhuma — mesmo raciocínio de sensibilidade de preço que já exclui esses papéis do Financeiro por completo.

Uma vez `status === "APPROVED"`, o pedido é terminal nesta fase: sem rota de exclusão física (o `financialDocumentId` preenchido já é, por definição, histórico financeiro vinculado — condição idêntica à de ADR-008) e sem cancelamento (explicitamente fora de escopo, ver acima). `DRAFT` pode ser excluído fisicamente (nunca teve vínculo financeiro) ou cancelado (soft, preserva o registro de "cotamos e decidimos não seguir").

**Justificativa**: reaproveitar a distribuição real do Financeiro (não uma versão simplificada lembrada de memória) foi uma correção feita durante o desenho deste módulo — a primeira versão do plano tinha ARCHITECT sem `delete` e ASSISTANT sem `update`, ambas inconsistentes com o mapa real verificado em `rbac.ts`. Isso reforça por que `MODULE_CREATION_CHECKLIST.md` Q10 exige citação com link, não "sim" de memória.

**Impacto futuro**: se uma fase futura de Compras adicionar cancelamento de pedido `APPROVED` (exigindo cancelar o `FinancialDocument` vinculado), essa é uma mudança estrutural nova — precisa de sua própria ADR antes do código, não uma extensão silenciosa desta.

> **Ver também**: `FINANCIAL_ARCHITECTURE_DECISIONS.md`, ADR-019 — a Domain Review de Compras (2026-07-16) encontrou o achado Crítico que esta ADR-018 deixava em aberto: nada impede o cancelamento direto do `FinancialDocument` gerado por um `PurchaseOrder` `APPROVED`, produzindo um pedido que afirma um compromisso financeiro inexistente. A ADR-019 resolve isso com um lock de origem genérico no próprio `FinancialDocument`, sem inverter a dependência unidirecional. Implementação ainda não realizada — ver o roadmap da ADR-019.

---

## Checklist de criação de módulo (`MODULE_CREATION_CHECKLIST.md`)

| # | Pergunta | Resposta |
|---|---|---|
| 1 | Aggregate + invariantes | Raiz: `PurchaseOrder`. Filho: `PurchaseOrderItem[]` (1:N, sempre criado junto com o pai). Invariantes: (a) `PurchaseOrder.totalAmountCents` == soma de `item.totalCents` — computado no servidor na criação, nunca aceito do cliente (mirror da Invariante 1 do Financeiro); (b) uma vez `APPROVED`, `financialDocumentId` está sempre preenchido — garantido pela mesma transação que faz o CAS de status (ADR-017); (c) nenhum `PurchaseOrder` pode transicionar de `APPROVED`/`CANCELLED` de volta para outro estado — `approve()`/`cancel()` só aceitam origem `DRAFT`. Serialização de operações concorrentes contra o mesmo id: CAS via `updateMany` condicional (ADR-017), não lock distribuído. |
| 2 | Repository | `src/repositories/purchaseOrder.repository.ts` — nenhum service chama `prisma` diretamente. |
| 3 | Service | `src/modules/purchasing/services/purchaseOrder.service.ts` — `workspaceId` explícito em toda função pública, `getById` lança `PURCHASE_ORDER_NOT_FOUND`, erros via `AppError(ErrorCode.X)`, barrel (`purchasing.module.ts`) como único ponto de import externo. |
| 4 | ADR | Este documento, ADR-016/017/018, escrito antes do código correspondente. |
| 5 | Documentação | `DOMAIN_GUIDE.md` a atualizar com o bounded context de Compras (pendente, ver relatório final da sprint); `CORE_MODULE_POLICY.md` não precisa de mudança — Compras não é Core, só consome Finance na direção já documentada. |
| 6 | Auditoria | `auditLog()` com eventos `purchase_order_created`, `purchase_order_approved`, `purchase_order_cancelled` — `correlationId`+`workspaceId`+`entity`/`entityId` sempre presentes (ADR-012). Nenhum dado sensível em log (preço de fornecedor formatado via `formatCentsBRL`, nunca centavos crus sem contexto, mesmo padrão do Financeiro). |
| 7 | Observabilidade | `approve()` (escrita transacional multi-coleção) envolvido em `timed("purchasing.approve", ...)`, mesmo padrão de `financial.createWithInstallments`. |
| 8 | Retry + idempotência | `create()`: chave de idempotência do cliente + índice único (ADR-017). `approve()`: atribuição convergente via CAS (ADR-017) — ambas via `withTransactionRetry()` (ADR-003/013), nunca `$transaction` cru. |
| 9 | Workspace | `workspaceId` direto em `PurchaseOrder` e `PurchaseOrderItem`; toda query do repository inclui `workspaceId` na própria cláusula (ADR-006); índices compostos começam com `workspaceId`. |
| 10 | RBAC | Mapa `PERMISSIONS` atualizado com `view/create/update/delete/approve:purchase-orders` (ADR-018), restringindo como o Financeiro (não herda `read:*`). |
| 11 | Soft Delete | `DRAFT` → exclusão física permitida (nunca teve vínculo financeiro) ou cancelamento soft. `APPROVED` → terminal, sem exclusão nem cancelamento (ADR-018), mesma pergunta do ADR-008 respondida "sim" (pode ter histórico financeiro vinculado) uma vez `financialDocumentId` existe. |
| 12 | Testes | Mockados: invariantes de `create`/`update`/`approve`/`cancel`, formato exato dos argumentos ao Prisma. Concorrência real: script throwaway `scripts/rc-compras-approve-check.ts`, aprovar-vs-aprovar e aprovar-vs-cancelar no mesmo id, resultado documentado no relatório da sprint, script apagado depois. |
| 13 | Índices | `[workspaceId, status]`, `[workspaceId, supplierId]`, `[workspaceId, projectId]` em `PurchaseOrder`; `[workspaceId, purchaseOrderId]` em `PurchaseOrderItem` — confirmados com `explain()` contra o volume real antes do relatório final. |
| 14 | Performance | Sem volume real de produção ainda nesta fase — não se aplica o processo de medição de `PERFORMANCE_GUIDE.md` (nada para medir); gatilho documentado no relatório final: revisitar quando o workspace piloto tiver pedidos suficientes para uma tela de listagem paginada real. |
