# Arquitetura do Módulo Financeiro

Referência técnica do módulo Financeiro (AP/AR do próprio escritório — distinto do billing do SaaS ArchFlow, ver `SPRINT09_BILLING_REPORT.md`). Escrito ao final da Sprint RC-2 ("Production Fixes"), que eliminou os riscos críticos levantados na auditoria RC-1, e atualizado ao final da Sprint RC-3 ("Zero Critical Debt"), que eliminou a race condition residual documentada pela RC-2, denormalizou `projectId` em `Payment` e ampliou observabilidade/testes. Atualizar este documento sempre que o modelo financeiro mudar.

---

## 1. Modelo de domínio

```
Workspace
 ├─ SupplierCategory ──< Supplier
 ├─ FinancialCategory (árvore auto-referenciada — plano de contas)
 ├─ CostCenter
 ├─ BankAccount
 └─ FinancialDocument ("título")
     ├─ direction: PAYABLE | RECEIVABLE
     ├─ projectId? / clientId? / supplierId? (nulos permitidos — despesa de
     │   estrutura não tem projeto; PAYABLE nunca tem clientId, RECEIVABLE
     │   nunca tem supplierId, reforçado no Zod)
     ├─ categoryId (direção da categoria deve bater com a do documento)
     └─ Installment[] ("parcela")
         └─ Payment[] ("baixa" — append-only, nunca editada/apagada)
```

Todo modelo financeiro tem `workspaceId` **obrigatório** (não-nulo) — diferente do padrão legado do resto do schema (`Client.workspaceId` opcional). Dado financeiro não pode ter ambiguidade de tenant.

### Por que Título → Parcela → Baixa, e não uma tabela plana

Um "contas a pagar" com um campo `paidAt` único não suporta pagamento parcial nem múltiplos pagamentos por parcela. O modelo em 3 camadas separa:

- **Título** (`FinancialDocument`) — o compromisso completo, imutável na sua natureza (`direction`, `projectId`, `clientId`, `supplierId` nunca mudam após criação).
- **Parcela** (`Installment`) — uma fatia do título com vencimento próprio, cujo `status` (`OPEN`/`PARTIAL`/`PAID`) é derivado da soma de suas baixas.
- **Baixa** (`Payment`) — o evento de caixa real, append-only. Reversão/estorno é dívida técnica conhecida (ver seção 8).

---

## 2. BigInt (RC-2.2)

Todo campo monetário (`amountCents`, `totalAmountCents`, `initialBalanceCents`) é **BigInt** (BSON Int64), não `Int` (BSON Int32).

### Por que

`Int32` satura em `2.147.483.647` — ~R$21,4 milhões em centavos. Um contrato institucional/comercial grande pode ultrapassar isso. Antes da RC-2, esse overflow seria silencioso (o comportamento exato do driver Mongo/Prisma nesse limite não foi verificado antes da migração — e nenhum dos dois resultados possíveis, rejeição ou truncamento silencioso, é aceitável sem tratamento explícito).

### Limitação técnica real encontrada e como foi resolvida

O Prisma **suporta** `BigInt` no conector MongoDB (mapeado para BSON Int64) — verificado empiricamente (`prisma db push` + leitura via `$runCommandRaw` confirmando `$type: "long"`). A limitação real está uma camada acima: **`JSON.stringify` não serializa `bigint` nativamente** (lança `TypeError: Do not know how to serialize a BigInt`), e toda rota deste backend responde via `NextResponse.json(...)`.

**Solução adotada**: `src/lib/money/money.ts` registra `BigInt.prototype.toJSON` no carregamento do módulo (importado por `src/lib/prisma.ts`, o ponto mais cedo possível), convertendo todo `bigint` para string decimal na serialização. Alternativas descartadas:
- Converter campo a campo em cada rota — mudança invasiva em dezenas de arquivos, alto risco de esquecer um ponto.
- Manter `Int` com teto validado via Zod — cobre "nunca overflow silencioso" mas não resolve contratos genuinamente grandes; ficou documentado como mitigação válida caso a migração para BigInt precisasse ser revertida.

### Convenção resultante

- **Backend**: todo valor monetário é `bigint` internamente. Nunca fazer aritmética direta (`+`, `-`, comparação) — usar `src/lib/money/money.ts` (`add`, `subtract`, `compare`, `netByDirection`, `remaining`).
- **Fronteira HTTP**: `bigint` sai como string numérica (`"3000000000"`). Nunca chega como `bigint` no corpo de uma requisição (JSON não tem esse tipo) — o cliente sempre envia reais (decimal), convertidos via `reaisToCents()` no service.
- **Frontend**: os tipos (`src/types/financialDocument.ts`, `bankAccount.ts`) declaram esses campos como `string`. `formatCentsBRL()` em `src/lib/format.ts` aceita `string | number` e é o único ponto de conversão para exibição — `Number(string)` é seguro para exibição em qualquer magnitude realista (o BigInt no backend protege precisão de armazenamento/soma, não a matemática de exibição).

### Migração de dados existentes

`scripts/migrate-money-fields-to-bigint.ts` (mantido no repo como registro histórico, mesmo padrão de `scripts/migrate-supabase-id.ts`) faz a conversão Int32→Int64 in-place via `$runCommandRaw` com `$toLong`, e faz backfill dos dois novos campos obrigatórios de `Payment` (`idempotencyKey`, `direction`) **antes** de aplicar o índice único — necessário porque um índice único não-esparso do Mongo rejeitaria múltiplos documentos existentes com o campo ausente.

---

## 3. Idempotência (RC-2.1)

### Problema

Sem proteção, a mesma intenção de pagamento pode ser executada duas vezes: timeout de rede seguido de retry, duplo clique que escapa do estado `disabled` do botão, duas abas abertas na mesma parcela, ou reenvio manual após um refresh. Para pagamento **parcial**, isso não era pego por nenhuma validação existente (o overpayment é rejeitado, mas dois pagamentos parciais idênticos e válidos, cada um dentro do saldo restante no momento em que foi lido, não eram).

### Estratégia adotada

**Otimista, não pessimista.** `Payment.idempotencyKey` é uma UUID obrigatória com índice único (`@unique`). O fluxo:

1. **Fast path** (`installment.service.ts`): antes de qualquer validação, busca um `Payment` existente com essa chave. Se existir, retorna direto — evita reprocessar a validação de saldo numa repetição óbvia. Inclui defesa cross-tenant: uma chave replicada contra outro workspace não vaza o pagamento.
2. **Dentro da transação** (`installment.repository.ts`): a mesma busca é repetida **no início de cada tentativa da transação, inclusive em retries** — não é redundante (ver "Achado de concorrência real" abaixo).
3. **Rede de segurança final**: se dois `create()` concorrentes chegam a colidir na chave única, o Mongo deixa só um confirmar; o outro recebe `P2002`, capturado e resolvido buscando o pagamento vencedor.

Um `check-then-insert` ingênuo teria uma janela TOCTOU exatamente aqui — deixar o índice único ser a fonte de verdade de "isso já aconteceu" fecha essa janela.

### Achado de concorrência real (não capturado pelos testes com mock)

Durante o desenvolvimento da RC-2, um teste de concorrência real contra o Mongo local (duas chamadas simultâneas, mesma `idempotencyKey`, via `Promise.all`) revelou um bug genuíno: a primeira chamada commitava seu pagamento; a segunda perdia um conflito de escrita no documento `Installment` compartilhado, era re-tentada por `withTransactionRetry` — e, na nova tentativa, relia o saldo **já reduzido** pelo pagamento da primeira, concluindo erroneamente que o pagamento excedia o saldo restante (`PAYMENT_EXCEEDS_REMAINING`), em vez de reconhecer que era o mesmo pagamento já concluído por sua "gêmea" concorrente.

**Correção**: a checagem de idempotência move para o **início do corpo da transação**, executada em toda tentativa (incluindo retries), antes de qualquer leitura de saldo. Ver `src/repositories/installment.repository.ts#registerPayment` e o teste de regressão em `src/__tests__/repositories/installment.repository.test.ts` ("on retry after a transient conflict..."). Esse é exatamente o tipo de bug que só aparece com concorrência real — os testes com mock, por mais cuidadosos, não reproduziam essa sequência específica até o cenário ser desenhado deliberadamente para simulá-la.

### Frontend

`src/lib/idempotencyKey.ts` gera a chave e persiste em `localStorage` (não `sessionStorage` — precisa ser compartilhada entre abas) por `installmentId`, reaproveitada em toda tentativa até um pagamento suceder, quando é limpa. Cobre os 6 cenários pedidos na auditoria: retry HTTP, duplo clique, duas abas, refresh, timeout, reenvio manual.

---

## 4. Transações e retry (RC-2.4)

`src/lib/transactionRetry.ts` — `withTransactionRetry()` envolve toda operação financeira que já usava `prisma.$transaction` (`createWithInstallments`, `registerPayment`, `cancelIfNoPayments`). Detecta `TransientTransactionError`/`WriteConflict` (Prisma `P2034`, mais um fallback por texto da mensagem) e re-tenta com backoff exponencial + jitter (3 tentativas por padrão). Um conflito de escrita real vira uma resposta bem-sucedida transparente para o usuário, não um 500 cru.

**Pré-condição para isso ser seguro**: a operação re-tentada precisa ser idempotente. É por isso que RC-2.1 (idempotência) é uma dependência direta de RC-2.4 — re-tentar uma escrita financeira que não fosse idempotente teria o mesmo risco de duplicação que o próprio retry pretende absorver silenciosamente.

---

## 5. Arquivamento / exclusão segura (RC-2.3)

Nenhuma entidade financeira permite exclusão física:

| Entidade | Mecanismo | Bloqueio |
|---|---|---|
| `Payment` | nunca editado/apagado | — (append-only por design) |
| `FinancialDocument` | soft-cancel (`isCancelled`) | bloqueado se `hasAnyPayments` |
| `Supplier` | soft (`isActive: false`) | nenhum — pode desativar mesmo com histórico |
| `BankAccount` | soft (`isActive: false`) | nenhum — mesmo raciocínio |
| `SupplierCategory` / `FinancialCategory` / `CostCenter` | soft (`isArchived: true`) | `FinancialCategory` bloqueia se tiver filhos ativos |
| `Project` (fora do módulo) | hard delete pré-existente | **bloqueado** (RC-2.3) se houver `FinancialDocument` vinculado |
| `Client` (fora do módulo) | hard delete pré-existente | **bloqueado** (RC-2.3) se houver `FinancialDocument` vinculado; fallback natural: `status: INACTIVE` |

`Project`/`Client` já existiam antes deste módulo e faziam `deleteMany` sem nenhuma noção de histórico financeiro — a auditoria RC-1 confirmou isso via leitura direta do código. A correção é um guard de referência (`financialDocumentService.hasDocumentsForProject/Client`), uma dependência unidirecional e somente-leitura do serviço que exclui sobre o módulo financeiro — não uma inversão da fronteira do domínio.

### Race condition cancelamento × pagamento — fechada (RC-3.1)

Risco identificado na RC-2: `cancelIfNoPayments` fazia a checagem "tem pagamento?" e o cancelamento dentro da mesma transação — o que fechava a corrida entre dois cancelamentos concorrentes, mas **não** a corrida entre um cancelamento e um `registerPayment` verdadeiramente concorrente, já que as duas transações escreviam em coleções diferentes (`financial_documents` vs `payments`/`installments`) e o Mongo não as serializava por não compartilharem o mesmo documento.

**Estratégia escolhida**: compare-and-set via escrita real e condicional no documento pai compartilhado. `registerPayment` agora executa, dentro da mesma transação e antes de criar o `Payment`, um `updateMany` condicional no `FinancialDocument`:

```ts
const guard = await tx.financialDocument.updateMany({
  where: { id: financialDocumentId, workspaceId, isCancelled: false },
  data: { version: { increment: 1 } },
})
if (guard.count === 0) throw new AppError(ErrorCode.FINANCIAL_DOCUMENT_CANCELLED)
```

Isso transforma a condição de corrida em uma contenção real que o próprio motor de transações do MongoDB já sabe detectar: quando `cancelIfNoPayments` e esse guard-write tentam mutar o mesmo `FinancialDocument` em transações sobrepostas, o Mongo aborta um dos dois com `WriteConflict`/`TransientTransactionError`, e `withTransactionRetry` (RC-2.4) já sabe re-tentar isso. No retry, cada lado relê o estado fresco e chega ao resultado correto — cancelamento vitorioso ⇒ o guard-write não encontra `isCancelled: false` e rejeita o pagamento; pagamento vitorioso ⇒ `cancelIfNoPayments` reconta pagamentos, encontra > 0 e recusa cancelar.

**Alternativas consideradas e descartadas**:
- *Lock distribuído (coleção de locks lógicos)* — resolveria o mesmo problema com mais peças móveis do que necessário, já que o motor de transação do Mongo dá essa garantia de graça assim que os dois escritores tocam o mesmo documento.
- *Fundir FinancialDocument+Installment+Payment num único aggregate* — resolveria de forma ainda mais direta, mas é uma reescrita de schema grande, fora do escopo de uma sprint de hardening com mandato explícito de "sem grandes refatorações".

Um campo `FinancialDocument.version` (Int, incrementado por ambos os escritores) foi adicionado — seu valor nunca é lido pela lógica de aplicação; sua função é apenas garantir que ambos os escritores mutem genuinamente o mesmo documento, dando ao Mongo algo real para detectar conflito.

**Verificação com concorrência real**: `scripts/rc3-concurrency-check.ts` (removido após a verificação, resultado documentado aqui) rodou 45 rodadas reais contra MongoDB — 30 sem stagger e 15 com uma vantagem deliberada de 15ms para `registerPayment` (para provar o ramo "pagamento vence" também, não só o caminho estruturalmente mais rápido de `cancelIfNoPayments`). Resultado: **29 cancelamentos vitoriosos, 16 pagamentos vitoriosos, zero anomalias** — nenhum documento cancelado terminou com um pagamento vivo contra ele, em nenhuma das 45 execuções. Teste de regressão mockado permanente em `installment.repository.test.ts` (describe "cancellation guard (RC-3.1)").

---

## 6. Dashboard (RC-2.5) — denormalização aplicada e estratégia futura

### O que foi feito na RC-2

`Payment.direction` é uma cópia denormalizada de `FinancialDocument.direction` (resolvida via `Installment` no momento da criação do pagamento). É seguro denormalizar porque `direction` é imutável após a criação do documento e `Payment` nunca é editado — não existe cenário em que essa cópia possa divergir da origem depois de escrita.

Isso elimina o `$lookup` de 2 saltos (`Payment → Installment → FinancialDocument`) que as 6 queries de agregação do dashboard faziam antes, substituído por um filtro direto em `Payment.direction`, coberto pelo índice `@@index([workspaceId, direction, paidAt])`.

### `projectId` também denormalizado (RC-3.3) — medido, não estimado

A RC-2 deixou `projectId` de fora do escopo da denormalização, marcado como "próximo candidato caso vire hot path". A RC-3 mediu, em vez de estimar, usando `scripts/rc3-perf-check.ts` (removido após a verificação) contra dados sintéticos reais em MongoDB:

| Payments no workspace | `projectFinancialSummaryService.getSummary()` (com `$lookup` `installment.financialDocument.projectId`) | Query equivalente com campo achatado + índice |
|---|---|---|
| 100.000 | **~30.337ms** | ~140ms |

Trinta segundos numa página de detalhe de projeto não é uma otimização marginal — é uma página que estoura timeout, num volume de dados plausível para um escritório de médio porte depois de alguns anos de uso (não é um cenário extremo de "big tech scale"). Isso decidiu a RC-3.3: `Payment.projectId` foi denormalizado, seguindo exatamente o mesmo raciocínio de segurança que `direction` já usava (imutável após a criação do documento, `Payment` nunca editado — impossível divergir da origem uma vez escrito). Índice novo: `@@index([workspaceId, projectId, direction])`.

**Verificação pós-implementação** (`scripts/rc3-verify-projectid-fix.ts`, removido após a verificação), com o campo real do schema (não mais uma simulação) e 300.000 payments — 3x o volume onde a versão antiga já levava 30s:

- `projectFinancialSummaryService.getSummary()`: **459,53ms**
- `financialDashboardService.getWidgets()`: 939,84ms (cresce com o volume, mas seguindo uma curva saudável — plano de execução confirmado usando `IXSCAN` via `explain()`, não `COLLSCAN`)

Migração de dados existentes: `scripts/migrate-backfill-payment-projectid.ts` (mantido no repositório) — backfill por linha via `Installment → FinancialDocument` (um pipeline `$lookup` dentro de `update` não é permitido pelo MongoDB — `code 72`; a mesma limitação que já existia na migração da RC-2.2). Aceitável para o volume de dados real hoje (pré-lançamento); se este backend crescer a ponto de precisar re-rodar esse backfill contra produção com centenas de milhares de linhas, trocar por uma agregação com `$merge` em vez do loop por linha.

### Quando migrar para rollup materializado

Não implementado nesta sprint (pedido explícito do brief: "Não implementar materialized views"). Gatilho recomendado: quando o volume de `Payment`/`Installment` por workspace individual (não a soma entre todos os tenants — cada query já é `workspaceId`-scoped) começar a ultrapassar a ordem de dezenas de milhares de linhas, ou quando o tempo de resposta do dashboard for medido e exceder o orçamento de latência aceitável.

### Como migrar

1. Criar uma coleção `financial_summaries` (ou por período: `financial_summaries_monthly`), chave `[workspaceId, yearMonth]` ou `[workspaceId, projectId, yearMonth]`, com os mesmos campos que `financialDashboardService.getWidgets()`/`projectFinancialSummaryService.getSummary()` já retornam.
2. Atualizar esse rollup de forma incremental a cada escrita em `Payment`/`FinancialDocument` (dentro da mesma transação de `registerPayment`/`createWithInstallments`, ou de forma assíncrona via fila/automação — este backend já tem a infraestrutura de `Automation`/`AutomationRun` reagindo a eventos de domínio, um lugar natural para pendurar isso).
3. `financialDashboardService`/`projectFinancialSummaryService` passam a ler do rollup em vez de agregar em tempo real; as funções atuais deste arquivo são exatamente o que seria substituído.
4. Manter as agregações em tempo real como fallback/reconciliação (job periódico que recalcula e compara), não descartar de imediato.

---

## 7. Money library (RC-2.8)

`src/lib/money/`:

- `money.ts` — aritmética BigInt pura (`add`, `subtract`, `compare`, `max`, `min`, `netByDirection`, `remaining`) + o registro do `BigInt.prototype.toJSON`.
- `converter.ts` — fronteira reais↔centavos (`reaisToCents`, `centsToReais`, `parseCents`).
- `validators.ts` — schemas Zod com teto de sanidade (`moneyAmountSchema`, `moneyBalanceSchema`, `MAX_REAIS_PER_ENTRY` ≈ R$1 bilhão por campo — não é limite técnico do BigInt, é proteção contra erro de digitação).
- `formatter.ts` — formatação BRL para logs/auditoria no backend (a formatação para o usuário final é sempre no frontend, `@/lib/format`).

Elimina 3 implementações duplicadas de `toCents()` que existiam em `bankAccount.service.ts`, `financialDocument.service.ts` e `installment.service.ts` antes desta sprint.

---

## 8. Timezone (RC-2.9)

Duas categorias de data, tratadas de forma diferente e cada uma com seus próprios helpers oficiais:

- **Date-Only** (`dueDate`, `competencyDate`, `paidAt`) — um dia de calendário escolhido via `<input type="date">`, sem hora significativa. Armazenado como meia-noite UTC; **sempre** lido/comparado/exibido em UTC (nunca no timezone local do servidor ou do navegador). Backend: `src/lib/dateOnly.ts#dateOnlyToUTCMidnight`. Frontend: `formatDateOnly()` em `@/lib/format.ts` (`timeZone: "UTC"` fixo no `Intl.DateTimeFormat`).
- **Business DateTime** (limites de mês do dashboard: "que mês é agora, para um escritório no Brasil") — depende do horário real, fixado num timezone de negócio (`America/Sao_Paulo`, UTC-3, sem horário de verão desde 2019 — constante fixa, não busca de timezone IANA real; documentado em `src/lib/dateOnly.ts` como simplificação deliberada, a ser revisada com uma lib de timezone real se o Brasil reinstituir horário de verão ou o produto expandir para outro país).

O bug original da auditoria RC-1 (datas exibidas um dia errado) era de exibição — corrigido antes desta sprint. Esta sprint fechou o segundo caso, mais sutil: o cálculo de início/fim de mês do dashboard usava `new Date(d.getFullYear(), d.getMonth(), 1)` (componentes locais do processo Node), produzindo limites de mês errados perto da virada quando o servidor roda em UTC (comum em produção) mas o escritório opera em UTC-3.

---

## 9. Preparação para Analytics

O modelo já é adequado para consultas analíticas amplas sem mudança de schema:

- Todo valor monetário é BigInt — soma agregada sobre milhões de linhas não estoura silenciosamente.
- `Payment.direction` denormalizado é o primeiro passo de um padrão mais amplo de "campos seguros duplicados para leitura" que uma camada de analytics também se beneficiaria.
- O padrão Título→Parcela→Baixa já separa "o que foi contratado" de "o que foi de fato pago", a distinção que qualquer relatório de fluxo de caixa real vs. previsto precisa.

Não implementado nesta sprint (fora de escopo): pipeline de ETL/data warehouse, ou qualquer agregação pré-computada além do que a seção 6 já descreve para o dashboard operacional.

## 10. Preparação para Compras

O módulo de Fornecedores (`Supplier`, `SupplierCategory`) e o vínculo Fornecedor↔Projeto (derivado de `FinancialDocument.supplierId`+`projectId`, sem tabela de junção própria) já fornecem a base de dados mestre que um módulo de Compras precisaria. Pontos de extensão previstos, não implementados:

- Um futuro `PurchaseOrder`/`Cotação` se relacionaria com `Supplier` e, ao ser aprovado, geraria um `FinancialDocument` (`direction: PAYABLE`) — o mesmo padrão que `Opportunity → Project` já usa neste código (automação de criação, não acoplamento direto de schema).
- `SupplierCategory` já é configurável por workspace (não enum fixo) — extensível para categorias de compra sem migração.

---

## 11. Sprint RC-3 — Zero Critical Debt

Objetivo: eliminar a dívida técnica remanescente da RC-2 antes do módulo de Compras existir, sem adicionar funcionalidades. A race condition de cancelamento×pagamento (fechada, §5) e a desnormalização de `projectId` (§6) são cobertas nas seções acima; esta seção cobre logging estruturado, observabilidade e a revisão de consistência de domínio.

### 11.1 Logging estruturado (RC-3.4)

Todo log de auditoria financeiro carrega um `correlationId` (UUID gerado uma vez por operação em `installment.service.ts`/`financialDocument.service.ts`, propagado explicitamente até o repositório e até `withTransactionRetry` — não uma `AsyncLocalStorage` global de request, deliberadamente: essa infraestrutura serviria o app inteiro, não só este módulo, e está fora do escopo desta sprint de hardening) e um campo `event` estável para busca/filtro em logs:

`payment_created` · `payment_rejected` · `duplicate_attempt` · `document_created` · `document_cancelled` · `retry_executed` · `retry_exhausted` · `transactional_conflict` · `unexpected_error`

Nenhum log inclui segredos, tokens, ou números de conta — apenas IDs internos (ObjectId) e valores monetários já formatados via `formatCentsBRL` (RC-2.8 — biblioteca existente desde a RC-2, mas nunca conectada a um log real até esta sprint; os logs anteriores usavam `.toString()` em centavos crus).

### 11.2 Observabilidade (RC-3.5)

`src/lib/metrics.ts` — coleta leve em processo (`recordDuration`, `incrementCounter`, `timed()`), sem sink externo nesta sprint. Cada chamada mapeia 1:1 para o que seria um Histogram/Counter OpenTelemetry — a migração futura troca apenas o consumidor de `getMetricsSnapshot()`, não re-instrumenta cada call site. Métricas coletadas hoje:

- `financial.registerPayment`, `financial.createWithInstallments`, `financial.cancelIfNoPayments`, `financial.dashboard.getWidgets`, `financial.projectSummary.getSummary` — duração (count/avg/max).
- `financial.transactionRetry.attempt` / `.conflict` / `.exhausted` — contadores de conflito transacional.
- `financial.registerPayment.blockedByCancel`, `financial.registerPayment.duplicateAttempt` — contadores de rejeição.

Não integrado a Prometheus/OpenTelemetry nesta sprint (pedido explícito do brief) — a coleta em memória por processo já é suficiente para o próximo passo (decidir gatilho do rollup materializado da §6) sem exigir infraestrutura nova agora.

### 11.3 Revisão de consistência de domínio (RC-3.7)

Auditoria de todos os repositories/services do módulo contra os padrões estabelecidos (Money Library, DateOnly, Retry, BigInt, escopo por `workspaceId`, soft-delete, idempotência). Encontrado e corrigido:

- `financialCategoryRepository.countChildren` e `bankAccountRepository.findPaymentSumsByDirection` filtravam apenas por um `id`/`parentId`/`bankAccountId` sem também escopar por `workspaceId` na própria query — seguro na prática (todo chamador já validava o id contra o workspace antes), mas inconsistente com o padrão do resto do domínio ("nunca confiar apenas na checagem de quem chamou"). Ambos passaram a receber `workspaceId` explícito.
- `financialCategoryRepository.countDocuments` e `supplierCategoryRepository.countSuppliers` eram código morto — nenhum caller em todo o app. Removidos em vez de mantidos "por precaução".

Nenhuma inconsistência encontrada nos padrões de Money Library / DateOnly / Retry / BigInt / soft-delete — todos os 9 services do módulo seguem exatamente o mesmo formato (`getById` lança `*_NOT_FOUND`, mutações sempre workspace-scoped, nenhuma aritmética monetária fora de `@/lib/money`).

### 11.4 Performance em escala (RC-3.6)

A descoberta principal está documentada na §6 (`projectId` — 30s → 460ms). Além disso:

- `financialDashboardService.getWidgets()` (11 agregações paralelas): ~514ms a 100k payments, ~940ms a 300k — cresce com o volume mas dentro de um orçamento de latência aceitável para uma página de dashboard, e `explain()` confirma uso de `IXSCAN` (não `COLLSCAN`) no índice `@@index([workspaceId, direction, paidAt])`. Não é o gargalo desta sprint — `projectId` era.
- Escrita em massa (seed sintético via `createMany`, fora do caminho transacional real): ~3.700-4.200 payments/segundo por lote de 10k — não é o número de throughput do `registerPayment` transacional real (que inclui idempotência, guard-write, retry), apenas um teto de referência para a camada de dados.
- Memória: nenhum crescimento de heap anômalo observado nas medições válidas (a única vez que memória subiu para ~4.5GB foi um artefato do próprio script de medição — debug logging do Prisma (`prisma:query`) bufferizado indefinidamente por um processo em background com stdout redirecionado e nunca liberado; corrigido nos scripts trocando para log síncrono em arquivo. Não é um comportamento do código de produção, é uma lição sobre como instrumentar scripts de carga no Windows).

### 11.5 Stress test de concorrência (RC-3.8)

`scripts/rc3-stress-check.ts` (removido após a verificação) — 3 cenários × 3 tiers (50/100/500 "usuários" simultâneos), todos contra MongoDB real via `Promise.allSettled`, não mocks:

| Cenário | 50 | 100 | 500 |
|---|---|---|---|
| **A** — N usuários, N parcelas distintas, N pagamentos distintos | 50/50 sucesso, 0 erros | 100/100 sucesso, 0 erros | 500/500 sucesso, 0 erros |
| **B** — N usuários disputando a MESMA parcela (chaves de idempotência diferentes — "double-click em N abas diferentes") | 1 pagamento criado, `PAID`, sem overpay, sem duplicata | idêntico | idêntico |
| **C** — N usuários reenviando o MESMO pagamento (mesma `idempotencyKey` — cenário literal da RC-2.1, agora a 500-way) | 1 linha de `Payment` no banco, os 50 chamadores recebem o mesmo pagamento de volta | idêntico (100 chamadores) | idêntico (500 chamadores) |

Nenhuma duplicidade, nenhuma perda, nenhum saldo incorreto, nenhuma inconsistência em nenhum dos 9 pares cenário×tier. Cenário B confirma o invariante de saldo sob a pior forma de contenção (N tentativas de pagar o valor total de uma única parcela ao mesmo tempo); Cenário C confirma que a garantia de idempotência da RC-2.1, verificada originalmente a 2-way, se sustenta a 500-way.

---

## Referências

- `PRODUCTION_AUDIT.md`, `docs/indexes.md` — riscos de produção e índices já mapeados no restante do sistema.
- `docs/SPRINT09_BILLING_REPORT.md` — o outro contexto "financeiro" deste sistema (billing do SaaS), deliberadamente isolado deste módulo.
