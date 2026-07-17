# ArchFlow — Domain Guide

**Status**: Release 1.0 (Finance Foundation), 2026-07-15
**Escopo**: mapa de domínio de todo o backend ArchFlow — Bounded Contexts, Aggregates, Entidades, Value Objects, Eventos, relacionamentos e fluxo de comunicação entre módulos. O módulo Financeiro é usado como o contexto de referência (o mais maduro, formalizado na Release 1.0) para o vocabulário e os padrões que todo bounded context deve seguir.

---

## 1. Bounded Contexts

ArchFlow é um único banco MongoDB compartilhado (não há schema-per-context), mas os modelos se organizam em contextos com fronteiras conceituais claras — cada um com sua própria linguagem ubíqua, e dependências deliberadamente unidirecionais entre eles (ver §6).

| Bounded Context | Modelos principais (`prisma/schema.prisma`) | Módulo de código |
|---|---|---|
| **Identity & Workspace** | `Workspace`, `User`, `WorkspaceInvite` | transversal (`src/services/workspace.service.ts`, `src/middlewares/`) |
| **Comercial / CRM** | `Client`, `Opportunity`, `Briefing`, `FollowUp` | `src/services/{client,opportunity,briefing,followup}.service.ts` |
| **Propostas** | `Proposal`, `ProposalVersion`, `ProposalMedia`, `ProposalStatusHistory` + biblioteca de conteúdo (`ProposalTemplate`, `ProposalSection`, `ProposalBlock`, `ProposalNarrative`, `ProposalSectionInstance`) | `src/services/proposal*.service.ts` |
| **Projetos** | `Project`, `Task` | `src/services/project.service.ts` |
| **Reuniões** | `Meeting` | `src/services/meeting.service.ts` |
| **Automações** | `Automation`, `AutomationRun` | `src/services/automation.service.ts` |
| **Documentos** | `Document`, `DocumentVersion`, `DocumentFolder` | `src/services/document.service.ts` |
| **Financeiro** (AP/AR do escritório) | `SupplierCategory`, `Supplier`, `BankAccount`, `FinancialCategory`, `CostCenter`, `FinancialDocument`, `Installment`, `Payment` | `src/modules/financial/` — **contexto de referência desta Release** |
| **Compras** (Fase 1 — Fundação) | `PurchaseOrder`, `PurchaseOrderItem` | `src/modules/purchasing/` — depende de Financeiro numa via só (`Supplier`/`FinancialCategory`/`CostCenter` lidos na criação; gera `FinancialDocument` via `approve()`), ver `COMPRAS_ARCHITECTURE_DECISIONS.md` |
| **Worklog** (Fase 1 — Fundação) | `TimeEntry`, `ActivityCategory` | `src/modules/worklog/` — depende de Projetos/Clientes/Tasks numa via só, só leitura de referência (`projectId`/`clientId`/`taskId` validados via `tenantGuard`, nunca importados como lógica de negócio); não é módulo Core nesta fase, ver `WORKLOG_ARCHITECTURE_DECISIONS.md` ADR-023 |
| **Billing** (SaaS do ArchFlow cobrando o escritório) | `Subscription`, `PaymentEvent`, `BillingHistory`, `BillingPlan` | `src/modules/billing/` |
| **Localização & Precificação** | `State`, `City`, `RegionalPricing` | `src/services/{location,pricing}.service.ts` — dado de referência público, sem `workspaceId` |
| **Autenticação (tokens)** | `ResetPasswordToken`, `EmailVerificationToken`, `RefreshToken` | `src/services/auth.service.ts` |

**Financeiro vs. Billing — a distinção mais importante do mapa**: são dois contextos de "dinheiro" completamente distintos que compartilham vocabulário superficial (`Payment`, `amount`) mas nunca devem compartilhar modelo. Financeiro é o dinheiro do escritório de arquitetura (contas a pagar/receber dos próprios clientes e fornecedores do escritório). Billing é o dinheiro do ArchFlow cobrando o escritório pela assinatura do SaaS. Um `FinancialDocument` nunca referencia uma `Subscription`, e vice-versa — mesmo que ambos um dia usem BigInt/centavos (ver ADR-001 e o Anexo de `FINANCIAL_ARCHITECTURE_DECISIONS.md`).

---

## 2. Aggregates

Um Aggregate, no sentido DDD, é um cluster de entidades que muda junto, sob uma única raiz que garante seus invariantes. Em MongoDB (sem transações implícitas entre coleções), um Aggregate é *reforçado por código*, não pelo banco — é exatamente o que `withTransactionRetry`+`$transaction` existem para fazer (ADR-003).

### 2.1 Título → Parcela → Baixa (o Aggregate financeiro)

```
FinancialDocument (raiz do aggregate)
  └─ Installment[]  (1:N, sempre criadas junto com o documento)
       └─ Payment[]  (1:N, cada baixa é append-only)
```

- **Raiz**: `FinancialDocument`. Toda escrita que precisa manter o aggregate consistente entra por aqui ou por um repository que conhece a raiz (`installmentRepository.registerPayment` lê o `FinancialDocument` pai antes de decidir).
- **Invariante 1**: `FinancialDocument.totalAmountCents` == soma de `Installment.amountCents` — garantido na criação (`createWithInstallments` calcula o total a partir das parcelas, nunca aceita um total do cliente).
- **Invariante 2**: soma de `Payment.amountCents` de uma `Installment` nunca excede `Installment.amountCents` — garantido dentro da transação de `registerPayment` (ADR-002/003).
- **Invariante 3**: nenhum `Payment` pode ser criado contra um `FinancialDocument` já cancelado — garantido pelo compare-and-set do ADR-004.
- **Por que não é um único documento MongoDB**: parcelamento variável (1 a 360 parcelas) e pagamentos parciais/múltiplos por parcela tornariam um documento aninhado grande demais e sujeito a contenção de escrita desnecessária entre parcelas não relacionadas do mesmo título.

### 2.2 BankAccount (aggregate independente)

`BankAccount` é sua própria raiz — não tem filhos no schema, mas é referenciado por `Payment.bankAccountId`. Saldo atual nunca é armazenado (`initialBalanceCents` + soma líquida de `Payment`s é sempre derivado em tempo de leitura) — o aggregate `Payment` é a fonte de verdade, `BankAccount` só guarda o saldo inicial.

### 2.3 FinancialCategory (aggregate em árvore auto-referenciada)

Raiz é qualquer nó sem `parentId`; `direction` é fixado por galho (herdado implicitamente da raiz, validado no service, não pelo banco — Mongo não tem CHECK constraints). Um nó não pode ser arquivado com filhos ativos (invariante reforçada em `financialCategoryService.archive`).

### 2.4 SupplierCategory → Supplier

Aggregate simples: uma categoria pode ter N fornecedores; arquivar a categoria nunca invalida fornecedores já vinculados (referência solta, não `@relation` com cascade).

### 2.5 PurchaseOrder → PurchaseOrderItem (Compras, Fase 1)

```
PurchaseOrder (raiz do aggregate)
  └─ PurchaseOrderItem[]  (1:N, sempre criados junto com o pedido)
```

- **Raiz**: `PurchaseOrder`. Mesma forma do aggregate financeiro (raiz + filhos 1:N, coleção própria — ver `COMPRAS_ARCHITECTURE_DECISIONS.md` ADR-016), deliberadamente mais simples: sem um terceiro nível (`PurchaseOrderItem` não tem filhos, ao contrário de `Installment` → `Payment`).
- **Invariante 1**: `PurchaseOrder.totalAmountCents` == soma de `PurchaseOrderItem.totalCents` — garantido na criação, nunca aceito do cliente (mesmo padrão de `FinancialDocument.totalAmountCents`).
- **Invariante 2**: transições de `status` só saem de `DRAFT` — `APPROVED`/`CANCELLED` são terminais, garantido por CAS (`ADR-017`).
- **Invariante 3**: `financialDocumentId` só é preenchido atomicamente junto com a transição para `APPROVED` — nunca um `PurchaseOrder` aprovado sem o `FinancialDocument` correspondente, e vice-versa (mesma transação, `ADR-017`).
- **Sem raça entre agregados diferentes** (ao contrário do ADR-004 do Financeiro): `approve()`/`cancel()` competem pelo MESMO documento `PurchaseOrder`, então o CAS de status já é suficiente — não precisou do padrão "escrever no documento compartilhado" porque aqui já é o documento compartilhado.

### 2.6 TimeEntry (Worklog, aggregate de documento único)

`TimeEntry` é sua própria raiz, sem filhos — o aggregate mais simples do mapa (nem Financeiro nem Compras têm um aggregate de um documento só). A invariante de concorrência ("no máximo um `TimeEntry` `RUNNING`/`PAUSED` por usuário") não usa o padrão CAS-no-mesmo-documento do Financeiro/Compras, porque o conflito aqui é entre documentos diferentes, não dentro de um só — resolvido via índice único esparso (`activeOwnerId`), ver `WORKLOG_ARCHITECTURE_DECISIONS.md` ADR-021. `ActivityCategory` é um aggregate de referência independente (mesma forma que `FinancialCategory`, sem hierarquia nesta fase).

---

## 3. Entidades vs. Value Objects

**Entidade** = tem identidade própria (`id`) e ciclo de vida rastreável ao longo do tempo. **Value Object** = definido inteiramente pelo seu valor, sem identidade própria, imutável.

| Tipo | Exemplos no contexto Financeiro |
|---|---|
| **Entidade** | `FinancialDocument`, `Installment`, `Payment`, `Supplier`, `BankAccount`, `FinancialCategory`, `CostCenter` — todos têm `id`, ciclo de vida (criado → talvez arquivado/cancelado) |
| **Value Object** | `Cents` (`bigint`, `src/lib/money/money.ts`) — dois valores de 15000 centavos são intercambiáveis, sem identidade própria. `FinancialDirection` (`PAYABLE`/`RECEIVABLE`), `InstallmentStatus`, `PaymentMethod` — enums, definidos pelo valor. `idempotencyKey` — não é uma entidade, é um atributo de valor único anexado a um `Payment`. `correlationId` — VO efêmero, existe só durante uma operação, nunca persistido. |

**Por que essa distinção importa na prática**: nunca comparar `Cents` por referência ou dar a ele um "histórico" próprio — dois `10000n` são sempre o mesmo valor, sem exceção. `FinancialDirection` nunca ganha um `id` ou uma tabela própria — é fechado (`PAYABLE | RECEIVABLE`), qualquer terceiro valor é uma mudança de domínio, não um dado a inserir.

---

## 4. Eventos de domínio

ArchFlow não tem um barramento de eventos formal (sem event sourcing, sem fila de mensagens). Dois mecanismos parciais cobrem o espaço de "algo relevante aconteceu":

### 4.1 Automações (`Automation`/`AutomationRun`)

O sistema de eventos mais antigo e mais completo do app — `AutomationKey` (10 chaves fixas, ex. `AUTO_CREATE_PROJECT_ON_APPROVED`) dispara regras de negócio determinísticas (sem IA) quando um evento de domínio ocorre (ex. proposta aprovada → cria projeto). `AutomationRun` é o log de execução, com `AutomationResultType` (`PROJECT_CREATED`, `TASK_CREATED`, `NOOP`, etc.) — o mais próximo de um Event Store que o app tem hoje.

### 4.2 Logs de auditoria estruturados (`event` + `correlationId`, ADR-010)

O padrão mais novo, hoje exclusivo do Financeiro — cada `event` (`payment_created`, `document_cancelled`, `retry_exhausted`, etc.) é um evento de domínio relevante, materializado como log estruturado, não como registro em coleção própria. Não substitui `AutomationRun` (automações mudam estado de outros agregados; logs de auditoria só registram o que aconteceu, não disparam reação). Ver §C do Anexo em `FINANCIAL_ARCHITECTURE_DECISIONS.md` para a lacuna de um terceiro padrão parcial (`src/lib/events.ts`) coexistindo sem unificação — decisão pendente para antes da Sprint de Compras.

**Recomendação para módulos futuros**: se um evento precisa **disparar** outro efeito (ex. Pedido de Compra aprovado → gerar `FinancialDocument`), use o padrão de Automação (`AutomationKey`/`AutomationRun`). Se o evento só precisa ser **registrado** para auditoria/observabilidade, use o padrão `event`+`correlationId` do ADR-010. Os dois não são substitutos um do outro.

---

## 5. Relacionamentos entre contextos

```
Opportunity ──(aprovada)──► Project ──(automação)──► Task[]
     │                          │
     │                          ├──► FinancialDocument[] (direction: RECEIVABLE, projectId)
     │                          └──► Document[], Meeting[], DocumentFolder[]
     │
     └──► Proposal ──► Project (proposalId, 1:1 app-enforced)

Client ──► FinancialDocument[] (direction: RECEIVABLE, clientId)
Client ──► Project[], Opportunity[], Proposal[], Meeting[]

Supplier ──► FinancialDocument[] (direction: PAYABLE, supplierId)
             (Fornecedor↔Projeto é *derivado* de FinancialDocument.supplierId+projectId,
              nunca uma tabela de junção própria — ver supplier.repository.ts#findProjects)

PurchaseOrder ──(aprovado)──► FinancialDocument (direction: PAYABLE, gerado por approve())
              ──► PurchaseOrderItem[]
              (link de mão única: PurchaseOrder.financialDocumentId aponta para o
               documento gerado; FinancialDocument nunca referencia o PurchaseOrder
               de volta — Compras depende de Financeiro, nunca o inverso, DOMAIN_GUIDE.md §6)

Workspace ──► (todo modelo de domínio, workspaceId direto — ADR-006)

Subscription/BillingPlan/BillingHistory ──► Workspace
             (bounded context de Billing, nunca cruza com FinancialDocument)
```

**Padrão de relacionamento no schema**: a maioria dos vínculos cross-context é um escalar plano (`projectId: String? @db.ObjectId`) sem `@relation` do Prisma — o Mongo não impõe integridade referencial de qualquer forma, então a decisão de usar `@relation` (que habilita `include` no Prisma) é tomada caso a caso conforme a necessidade de leitura, não como padrão automático. Onde a relação existe (`FinancialDocument.project`, `.client`, `.supplier`, `.category`, `.costCenter`), ela é sempre opcional no lado "um" e nunca tem cascade de delete configurado a partir do lado financeiro — nada externo ao Financeiro pode apagar um `FinancialDocument` por tabela em cascata.

---

## 6. Dependências entre módulos — regra de uma via só

O princípio arquitetural mais importante deste mapa, formalizado pela primeira vez durante a RC-2.3 e agora congelado como padrão:

> **Uma dependência entre bounded contexts é sempre unidirecional, e nunca envolve lógica de negócio compartilhada — só uma checagem de referência, somente leitura.**

Exemplo concreto: `project.service.ts#delete` chama `financialDocumentService.hasDocumentsForProject(projectId, workspaceId)` antes de excluir um projeto. Isso é uma dependência de **Projetos sobre Financeiro**, não o inverso — o módulo Financeiro nunca importa nada de `project.service.ts`, nunca sabe que Projetos existe como conceito de negócio além de um `projectId` opcional em seu próprio schema.

```
[Projetos]  ──consulta (read-only)──►  [Financeiro]
[Clientes]  ──consulta (read-only)──►  [Financeiro]

[Financeiro]  ──X nunca importa──►  [Projetos] / [Clientes] / [Compras futuro]
```

**Por que essa direção e não a outra**: Financeiro é o contexto mais "denso" em invariantes (dinheiro, auditoria, imutabilidade) — deixá-lo como folha da árvore de dependências (nada depende dele saber sobre o resto do app) significa que qualquer módulo futuro pode adicionar uma checagem contra o Financeiro sem o Financeiro precisar mudar uma linha. Se a direção fosse invertida (Financeiro sabendo sobre Projetos/Compras), toda mudança em Projetos arriscaria quebrar o módulo mais sensível do sistema.

**Regra para a Sprint de Compras**: Compras vai depender de `Supplier` (Financeiro) e vai gerar `FinancialDocument` (Financeiro) — isso é uma dependência de Compras sobre Financeiro, seguindo exatamente esta regra. Financeiro nunca deve importar nada do módulo de Compras. Ver `ARCHITECTURE_ROADMAP.md` para o desenho completo dessa integração.

---

## 7. Entity Lifecycle — Arquivar, Restaurar, Cancelar, Excluir (ADR-020)

Toda entidade deste mapa que participa do ciclo de vida "arquivável" (§2/§3 acima — a maioria das entidades com identidade própria e ciclo de vida rastreável) segue um padrão único de plataforma, formalizado em `CORE_ARCHITECTURE_DECISIONS.md` ADR-020. Este parágrafo existe para que qualquer bounded context novo (Contratos, Portal do Cliente, Integrações) encontre a resposta aqui, sem precisar de uma ADR própria.

**Os quatro comportamentos, e como não confundi-los**:

- **Arquivar** (`archived`/`archivedAt`/`archivedBy`) — esconde o registro das telas normais, sempre reversível. É o significado de "excluir" na maioria dos botões de UI do ArchFlow hoje (Cliente, Oportunidade, Proposta, Projeto, Reunião, Documento, Fornecedor e toda entidade de referência financeira).
- **Cancelar** (`isCancelled`/`status: CANCELLED`, específico de cada entidade) — o registro deixa de representar um compromisso de negócio ativo, mas nunca é escondido nem some das telas. `FinancialDocument`/`PurchaseOrder` usam este padrão, não Arquivar, porque cancelamento é sobre o *significado* do registro, não sobre visibilidade.
- **Excluir fisicamente** — reservado a entidades sem nenhum histórico de terceiros possível no estado em que a exclusão é permitida (hoje: só `PurchaseOrder` em `DRAFT`). Nunca o comportamento padrão de uma entidade nova.
- **Um valor comum de `status` de negócio** (ex. `ClientStatus.INACTIVE`) nunca é arquivamento — é só mais um valor dentro da própria máquina de estados da entidade, livremente editável.

**Regra para qualquer módulo novo**: toda entidade arquivável tem exatamente `archived: Boolean`/`archivedAt: DateTime?`/`archivedBy: String? @db.ObjectId`, nunca reaproveitando `status`/`active`/`inactive`/`deleted`/`disabled` para o mesmo propósito, e delega a `src/services/entityLifecycle.service.ts` para executar a transição (guarda de negócio + carimbo + auditoria via `auditLog`, ADR-012) — nunca reimplementa seu próprio `updateMany` de arquivamento. Ver a ADR-020 completa para a tabela de comportamento oficial, os anti-padrões, e como isso se generaliza para Compras/Contratos/Portal/IA/Integrações sem exigir nenhuma alteração no modelo.
