# Financial Architecture Decisions

**Status**: CONGELADO — Release 1.0 (Finance Foundation), 2026-07-15
**Escopo**: decisões arquiteturais do módulo Financeiro (`src/modules/financial/`), promovidas a padrão oficial do ArchFlow para todo módulo futuro.

Este documento é um log de Architecture Decision Records (ADR). Cada decisão nasceu de um risco real encontrado ao longo das sprints MVP → RC-1 → RC-2 → RC-3, não de preferência estética. Onde uma decisão foi validada por medição real (não estimativa), a medição está citada.

**Regra de congelamento**: nenhuma mudança estrutural nas decisões abaixo sem um novo ADR aprovado. Módulos futuros (Compras, Analytics, IA, Portal do Cliente, Obras) devem reutilizar esta fundação — ver `ARCHITECTURE_ROADMAP.md` e `ENGINEERING_STANDARDS.md`.

## Índice

| ADR | Título | Status |
|---|---|---|
| [001](#adr-001--dinheiro-sempre-bigint-nunca-float) | Dinheiro: sempre BigInt, nunca Float | Congelado |
| [002](#adr-002--idempotência-obrigatória-em-todo-pagamento) | Idempotência obrigatória em todo pagamento | Congelado |
| [003](#adr-003--toda-escrita-multi-coleção-é-transacional-com-retry) | Toda escrita multi-coleção é transacional, com retry | Congelado |
| [004](#adr-004--race-conditions-entre-agregados-fecham-via-compare-and-set-não-locks) | Race conditions entre agregados fecham via compare-and-set, não locks | Congelado |
| [005](#adr-005--dateonly-vs-datetime-são-tipos-diferentes) | DateOnly vs DateTime são tipos diferentes | Congelado |
| [006](#adr-006--workspace-first-sem-exceção) | Workspace-First, sem exceção | Congelado |
| [007](#adr-007--rbac--defesa-em-profundidade-repository-nunca-confia-no-controller) | RBAC + defesa em profundidade — repository nunca confia no controller | Congelado |
| [008](#adr-008--nunca-excluir-histórico-financeiro-arquivar-sempre-que-possível) | Nunca excluir histórico financeiro — arquivar sempre que possível | Congelado |
| [009](#adr-009--dashboard-consome-agregações-nunca-contém-regra-de-negócio) | Dashboard consome agregações, nunca contém regra de negócio | Congelado |
| [010](#adr-010--logging-estruturado-com-correlationid-e-event) | Logging estruturado com correlationId e event | Congelado |
| [011](#adr-011--desnormalização-é-decidida-por-medição-não-por-intuição) | Desnormalização é decidida por medição, não por intuição | Congelado |
| [019](#adr-019--financial-document-ownership-lock-de-origem-genérico) | Financial Document Ownership — lock de origem genérico | ACCEPTED (princípio arquitetural congelado) |

---

## ADR-001 — Dinheiro: sempre BigInt, nunca Float

**Problema**: `Float`/`Number` em JavaScript usa IEEE-754 de precisão dupla — operações repetidas de soma/subtração em valores monetários acumulam erro de arredondamento, e o MongoDB armazena `Int` como BSON Int32, com teto de ~R$21.400.000,00 antes de estourar silenciosamente (sem exceção, sem log — o valor simplesmente trunca). Um contrato de arquitetura de grande porte já ultrapassa esse teto.

**Alternativas consideradas**:
- `Decimal`/`Prisma.Decimal` — precisão correta, mas sem suporte nativo eficiente no conector MongoDB do Prisma na versão em uso; adiciona uma dependência de serialização a mais sem necessidade.
- `Number` com validação de teto — não resolve o problema de precisão de ponto flutuante, só adia o estouro.
- `BigInt` (BSON Int64) armazenando centavos — sem erro de arredondamento (aritmética inteira), teto efetivamente irrelevante para valores monetários reais (~92 quintilhões de centavos).

**Solução escolhida**: todo campo monetário no schema é `BigInt`, armazenando **centavos**, nunca reais fracionários. Confirmado empiricamente que o conector MongoDB do Prisma suporta `BigInt` (mapeado para BSON `long`) sem ressalvas.

**Justificativa**: aritmética inteira em centavos elimina a classe inteira de bugs de arredondamento por design — não é uma questão de "cuidado ao programar", é estruturalmente impossível errar por ponto flutuante quando não há ponto flutuante. `BigInt` também não é serializável por `JSON.stringify` nativamente — resolvido registrando `BigInt.prototype.toJSON` uma única vez, no módulo central da Money Library (`src/lib/money/money.ts`), como efeito colateral de import.

**Impacto futuro**: qualquer módulo que manipule dinheiro (Compras, faturas de assinatura, futuras integrações de pagamento) usa `BigInt` em centavos desde o schema, sem exceção. Fronteira reais↔centavos só existe em dois lugares: `reaisToCents`/`centsToReais` (entrada/saída de formulário) — nunca no meio da lógica de negócio.

---

## ADR-002 — Idempotência obrigatória em todo pagamento

**Problema**: toda escrita financeira que pode ser reenviada pelo cliente (retry de rede, duplo clique, duas abas, F5 depois de um timeout, reenvio manual após erro ambíguo) precisa produzir exatamente um efeito, nunca mais. Um "check then insert" ingênuo (verificar se já existe, depois criar) tem uma janela de corrida — duas requisições concorrentes podem ambas passar pelo "não existe" antes de qualquer uma criar.

**Alternativas consideradas**:
- Debounce no frontend (desabilitar botão após clique) — mitiga o caso comum, não fecha a garantia; um usuário com duas abas ou um retry de rede no nível de transporte contorna completamente.
- Checagem "existe pagamento com esses dados?" antes de inserir — sujeita à mesma corrida TOCTOU (time-of-check/time-of-use) que motivou toda a RC-2.1.
- Chave de idempotência gerada pelo cliente, validada apenas na aplicação (sem índice único no banco) — a validação da aplicação tem a mesma janela de corrida; só o banco pode garantir atomicidade de "nunca duas vezes".

**Solução escolhida**: toda escrita de `Payment` exige uma `idempotencyKey` (UUID) gerada pelo cliente no momento da intenção do usuário (não a cada retry), persistida com `@unique` no schema. A garantia real vem do índice único, não de uma checagem prévia — a checagem prévia é um atalho de performance/clareza, não o mecanismo de correção. Ver ADR-004 para como isso se sustenta sob concorrência real (não só sob retry sequencial).

**Justificativa**: um índice único no banco é a única coisa que garante atomicidade de "nunca duas vezes" sob concorrência real — qualquer verificação em código de aplicação, por mais cedo que rode na função, deixa uma janela. Validado por teste de concorrência real (não mockado) a 500-way (`registerPayment`, mesma `idempotencyKey`, 500 chamadas simultâneas): 500 chamadores recebem o mesmo pagamento de volta, exatamente 1 linha no banco.

**Impacto futuro**: todo módulo com efeito financeiro ou não-idempotente por natureza (criar Pedido de Compra, gerar Nota Fiscal, disparar cobrança) usa o mesmo padrão: chave de idempotência gerada no cliente + índice único + checagem no início de toda tentativa de transação (não só antes da primeira). `getOrCreatePaymentIdempotencyKey`/`clearPaymentIdempotencyKey` (`src/lib/idempotencyKey.ts`, frontend) é o padrão de referência para persistir a chave no `localStorage` do navegador entre re-renders/re-tentativas.

---

## ADR-003 — Toda escrita multi-coleção é transacional, com retry

**Problema**: MongoDB não tem integridade referencial nem constraints entre coleções. Uma escrita que precisa manter dois ou mais documentos consistentes entre si (ex.: criar `Payment` e atualizar o `status` do `Installment` pai) pode, sem transação, deixar um escrito e o outro não se o processo cair no meio — corrompendo o ledger sem deixar rastro do que aconteceu.

**Alternativas consideradas**:
- Escrita "melhor esforço" com reconciliação posterior (job que audita e corrige divergências) — adia o problema, permite uma janela onde o estado é visivelmente inconsistente, e exige um segundo sistema (o job) para nunca falhar silenciosamente.
- Padrão saga (compensação manual por evento) — apropriado para transações distribuídas entre serviços diferentes; aqui todas as coleções envolvidas estão no mesmo banco MongoDB, que já suporta transações multi-documento nativamente — usar saga seria reimplementar o que o banco já oferece.
- `prisma.$transaction` sem retry — resolve atomicidade, mas MongoDB pode abortar uma transação com `WriteConflict`/`TransientTransactionError` sob concorrência real (duas transações tentando mutar o mesmo documento); sem retry, isso vaza como erro 500 para o usuário por um conflito passageiro que se resolveria numa segunda tentativa.

**Solução escolhida**: toda escrita que toca mais de uma coleção usa `prisma.$transaction`, envolvida por `withTransactionRetry()` (`src/lib/transactionRetry.ts`) — detecta `TransientTransactionError`/`WriteConflict` (Prisma `P2034` + fallback por texto) e re-tenta com backoff exponencial + jitter (3 tentativas por padrão).

**Justificativa**: retry só é seguro porque toda operação retentada é idempotente (ADR-002) — um retry de uma escrita não-idempotente teria o mesmo risco de duplicação que o mecanismo pretende evitar. Essa é uma dependência direta e deliberada: RC-2.4 (retry) depende de RC-2.1 (idempotência) existir primeiro.

**Impacto futuro**: `withTransactionRetry()` é infraestrutura de propósito geral, não específica do Financeiro — qualquer módulo futuro com escrita multi-coleção (Pedido de Compra → Item de Compra, Cotação → Fornecedores) importa e usa a mesma função. Nenhuma escrita financeira (nem futura) deve chamar `prisma.$transaction` diretamente sem passar por `withTransactionRetry()`.

> **Ver também**: `CORE_ARCHITECTURE_DECISIONS.md`, ADR-013 — Sprint 0 generalizou esta regra para todo o Core (não só Financeiro), depois de encontrar escritas multi-coleção sem retry em `subscription.service.ts` e `workspace.service.ts`.

---

## ADR-004 — Race conditions entre agregados fecham via compare-and-set, não locks

**Problema**: dois agregados relacionados mas escritos por operações diferentes (ex.: cancelar um `FinancialDocument` vs. registrar um `Payment` contra uma de suas parcelas) podem, se cada operação só toca sua própria coleção, correr uma contra a outra sem o MongoDB nunca detectar conflito — as duas transações não compartilham nenhum documento, então não há nada para o motor de conflito de escrita serializar. Descoberto na RC-3.1: um pagamento podia aterrissar no instante exato após um cancelamento "passar" na checagem, produzindo um documento cancelado com um pagamento vivo contra ele.

**Alternativas consideradas**:
- Lock distribuído (coleção de locks lógicos, adquirido/liberado manualmente) — resolve, mas adiciona uma peça de infraestrutura inteira (gestão de lock, timeout de lock morto, ordem de aquisição para evitar deadlock) para um problema que o banco já resolve de graça sob a condição certa.
- Fundir os agregados relacionados num único documento (ex.: `FinancialDocument` + `Installment` + `Payment` como um só) — fecharia a race estruturalmente, mas é uma reescrita de schema grande; correto a considerar quando o domínio crescer o suficiente para justificar (ver "Impacto futuro" abaixo), não como reação a uma race condition específica.
- Não fechar (deixar documentado como risco residual aceito) — foi a decisão da RC-2 por um sprint, mas não é aceitável como estado permanente para uma fundação que outros módulos vão herdar.

**Solução escolhida**: fazer as duas operações concorrentes escreverem genuinamente no MESMO documento compartilhado, mesmo quando uma delas não precisaria tocar esse documento por razões de negócio — a escrita extra existe só para dar ao motor de transação do MongoDB algo real para detectar como conflito. No caso concreto: `registerPayment` passou a executar um `updateMany` condicional (`where: { isCancelled: false }`, incrementando um campo `version`) no `FinancialDocument` pai antes de criar o `Payment`. Isso transforma a corrida entre coleções numa contenção real que o Mongo já sabe serializar, resolvida pelo retry do ADR-003.

**Justificativa**: verificado sob concorrência real (não mock) — 45 execuções de `cancelIfNoPayments` vs `registerPayment` disputando o mesmo documento, incluindo 15 com vantagem deliberada ao lado estruturalmente mais lento para provar os dois ramos: zero anomalias.

**Impacto futuro**: este é o padrão a aplicar sempre que dois fluxos de escrita legítimos e independentes podem, em teoria, correr um contra o outro em torno do mesmo agregado de negócio — antes de reachar para um lock distribuído ou uma reescrita de schema, perguntar "posso fazer os dois lados escreverem genuinamente no mesmo documento?". Candidato natural para o padrão de aggregate único fundido (Fusão de FinancialDocument+Installment+Payment): se o domínio de Compras introduzir um terceiro tipo de escrita concorrente contra o mesmo `FinancialDocument` (ex.: uma Nota Fiscal vinculando-se automaticamente), reavaliar a fusão de schema neste ponto — três operações independentes competindo por compare-and-set no mesmo campo começa a justificar o custo da reescrita que a RC-3.1 descartou para duas.

---

## ADR-005 — DateOnly vs DateTime são tipos diferentes

**Problema**: uma data escolhida por um usuário num `<input type="date">` (competência, vencimento, data de pagamento) não tem hora significativa — é um dia de calendário. Tratá-la como um instante de tempo (`DateTime` com timezone implícito do servidor) produz o bug clássico "a data aparece um dia antes/depois" quando o servidor roda em UTC mas o usuário está em UTC-3, exatamente o tipo de bug que passa despercebido em desenvolvimento (onde servidor e usuário costumam estar no mesmo fuso) e aparece só em produção.

**Alternativas consideradas**:
- Guardar a data como string (`"2026-07-15"`) sem conversão para `Date` — evita o bug de timezone por completo, mas perde a capacidade de usar operadores de intervalo (`gte`/`lte`) do MongoDB para filtros de "vencendo entre X e Y", que dependem de comparação de `Date`.
- Sempre usar o timezone do navegador do usuário, propagado a cada requisição — funciona, mas exige que toda rota financeira aceite e propague um parâmetro de timezone, e trata "vencimento" como se dependesse de onde o usuário está fisicamente no momento em que abre a tela, quando na verdade é uma propriedade do escritório (workspace), não da sessão.
- Biblioteca de timezone real (ex.: `date-fns-tz`, IANA) desde o início — usada para o caso realmente dependente de horário de negócio (ver abaixo), mas over-engineering para o caso Date-Only, que não precisa de fuso algum se tratado como um dia puro.

**Solução escolhida**: duas categorias de data, tratadas por helpers oficiais distintos:
- **Date-Only** (`dueDate`, `competencyDate`, `paidAt`) — armazenado como meia-noite UTC, **sempre** lido/comparado/exibido em UTC, nunca no timezone local do servidor ou do navegador. Backend: `src/lib/dateOnly.ts#dateOnlyToUTCMidnight`. Frontend: `formatDateOnly()` com `timeZone: "UTC"` fixo no `Intl.DateTimeFormat`.
- **Business DateTime** (limites de mês do dashboard — "que mês é agora, para um escritório no Brasil") — depende do horário real, fixado num timezone de negócio (`America/Sao_Paulo`, UTC-3, sem horário de verão desde 2019 — constante fixa documentada como simplificação deliberada, não busca de timezone IANA real).

**Justificativa**: a distinção não é estética — são dois problemas matematicamente diferentes. Um dia de calendário não tem fuso horário; um "agora, para este escritório" tem. Confundir os dois produz bugs sutis que só aparecem perto de meia-noite ou da virada de mês, difíceis de reproduzir em teste manual.

**Impacto futuro**: todo campo de data novo em qualquer módulo deve ser classificado explicitamente como Date-Only ou Business DateTime antes de escrever uma linha de código — nunca usar `new Date()` bruto para nenhum dos dois casos. Se o Brasil reinstituir horário de verão ou o produto expandir para fora do fuso `America/Sao_Paulo`, a constante fixa em `dateOnly.ts` precisa virar uma dependência real de timezone (IANA) — o comentário no código já marca esse gatilho.

---

## ADR-006 — Workspace-First, sem exceção

**Problema**: ArchFlow é multi-tenant — cada escritório de arquitetura é isolado dos outros. O vetor nº 1 de vazamento cross-tenant em SaaS multi-tenant é uma query que filtra por um `id` de recurso sem também confirmar que esse recurso pertence ao workspace do usuário autenticado (IDOR — Insecure Direct Object Reference).

**Alternativas consideradas**:
- Isolamento por schema-per-tenant ou database-per-tenant — mais forte estruturalmente, mas exige provisionamento de infraestrutura por workspace, incompatível com a escala e o estágio atual do produto; reavaliar apenas se um requisito de compliance (ex.: contrato enterprise exigindo isolamento físico) o justificar.
- Middleware único que injeta `workspaceId` automaticamente em toda query (nível de ORM/driver) — reduziria repetição, mas o conector MongoDB do Prisma não oferece esse gancho de forma confiável hoje; a alternativa realista é disciplina de código + revisão, não automação total.
- Confiar apenas no Controller/RBAC para filtrar por workspace, deixando o Repository aceitar qualquer `id` — rejeitado, ver ADR-007.

**Solução escolhida**: toda tabela de domínio tem `workspaceId` como campo direto (não FK via tabela pivot); toda query de leitura/escrita no Repository inclui `workspaceId` explicitamente no `where`, derivado da sessão autenticada — nunca de um parâmetro vindo do cliente. Todo índice composto usado por uma query financeira começa com `workspaceId` (ex.: `@@index([workspaceId, direction, paidAt])`).

**Justificativa**: um `id` de recurso é sempre tratado como "não confiável até prova em contrário" — a prova é o filtro por `workspaceId` na mesma query, não uma checagem prévia separada (que teria a mesma janela TOCTOU do ADR-002). Auditado explicitamente durante a RC-3.7: dois métodos de repository (`countChildren`, `findPaymentSumsByDirection`) filtravam apenas por um id sem também escopar por `workspaceId` na própria query — seguros na prática (o chamador já validava), mas inconsistentes com este padrão; corrigidos por defesa em profundidade, não porque houvesse uma vulnerabilidade explorável identificada.

**Impacto futuro**: nenhuma exceção — todo módulo futuro, sem exceção, segue este padrão desde o primeiro `schema.prisma`. Um PR que adicione uma query de domínio sem `workspaceId` no `where` deve ser bloqueado em revisão (ver `ENGINEERING_STANDARDS.md`, checklist de PR).

> **Ver também**: `CORE_ARCHITECTURE_DECISIONS.md`, ADR-015 — Sprint 0 estendeu esta regra para entidades sem campo `workspaceId` direto (via filtro de relação), depois de encontrar a mesma lacuna em `media`/`briefing`/`status.repository.ts`.

---

## ADR-007 — RBAC + defesa em profundidade — repository nunca confia no controller

**Problema**: um botão escondido no frontend não é controle de acesso — qualquer usuário pode chamar a API diretamente. A checagem de permissão precisa existir no backend; a pergunta é em qual camada, e se uma única camada é suficiente.

**Alternativas consideradas**:
- Checagem de permissão só no middleware/controller (nível de rota) — é necessária, mas se for a ÚNICA camada, qualquer bug de composição (uma função de service chamada de um contexto diferente do esperado, um novo endpoint que esquece de aplicar o middleware) vira um buraco de segurança sem segunda linha de defesa.
- Checagem de permissão espalhada ad-hoc dentro de cada função de service, sem um mapa central — funciona caso a caso, mas não dá visibilidade de "quem pode fazer o quê" num único lugar auditável.
- Permissões como enum fixo por role, sem granularidade por verbo/recurso — mais simples, mas não expressa casos reais como "ASSISTANT pode criar lançamento financeiro mas não pode ver o dashboard agregado" (visibilidade de margem é mais sensível que lançar uma conta).

**Solução escolhida**: RBAC hierárquico (`OWNER > ADMIN > ARCHITECT/DESIGNER > ASSISTANT > VIEWER`, ver `src/middlewares/rbac.ts`) com permissões granulares por string `verbo:recurso` (`view:financial-dashboard`, `create:financial-documents`, `manage:financial-settings`), aplicado no middleware de rota — E, adicionalmente, todo Repository escopa por `workspaceId` (ADR-006) independentemente do que o controller já validou, como segunda linha de defesa que não depende da primeira estar correta.

**Justificativa**: "defesa em profundidade" significa que a falha de uma camada não é catastrófica sozinha. Financeiro é o único domínio do ArchFlow onde `read:*` (leitura universal dentro do workspace, padrão para o resto do produto) não se aplica — visibilidade de margem/lucro do escritório é tratada como mais sensível que dados de cliente/projeto, exigindo `view:financial-*` explícito por role.

**Impacto futuro**: todo módulo novo declara seu mapa de permissões em `PERMISSIONS` (`rbac.ts`) explicitamente — nunca herdar `read:*` por padrão se o domínio tiver alguma razão de negócio para restringir visibilidade (ex.: Compras provavelmente segue o mesmo raciocínio do Financeiro: preço pago a fornecedor é informação sensível). Repository de todo módulo novo replica o padrão do ADR-006 como segunda camada, mesmo que o controller já pareça suficiente.

---

## ADR-008 — Nunca excluir histórico financeiro. Arquivar sempre que possível.

**Problema**: uma exclusão física (`DELETE`) de qualquer registro com histórico financeiro associado destrói rastro de auditoria de forma irrecuperável — inaceitável para um domínio de dinheiro, onde "o que aconteceu" precisa ser reconstruível indefinidamente (obrigação legal/contábil, não só preferência de produto).

**Alternativas consideradas**:
- Exclusão física com backup/soft-recovery via snapshot de banco — tecnicamente recuperável, mas exige processo manual de restauração para um caso que devia ser trivialmente prevenido; e a maioria dos backups têm janela de retenção finita.
- Exclusão física permitida só para OWNER — não resolve o problema de fundo (perda de rastro), só restringe quem pode causá-lo.
- Soft-delete/arquivamento universal, com bloqueio de exclusão física onde há vínculo financeiro — a escolhida.

**Solução escolhida**: nenhuma entidade financeira suporta exclusão física.
| Entidade | Mecanismo |
|---|---|
| `Payment` | nunca editado nem apagado (append-only por design) |
| `FinancialDocument` | soft-cancel (`isCancelled`), bloqueado se já houver pagamento |
| `Supplier`, `BankAccount` | soft (`isActive: false`), sem bloqueio — desativação nunca perde histórico |
| `SupplierCategory`, `FinancialCategory`, `CostCenter` | soft (`isArchived: true`); `FinancialCategory` bloqueia se tiver subcategorias ativas |
| `Project`, `Client` (fora do módulo, hard-delete pré-existente) | **bloqueado** se houver `FinancialDocument` vinculado — guard adicionado durante a RC-2.3 |

**Justificativa**: `Project`/`Client` já existiam antes do módulo Financeiro e faziam `deleteMany` sem noção nenhuma de histórico financeiro — confirmado por leitura direta do código durante a auditoria RC-1. A correção foi um guard de referência unidirecional e somente-leitura (`financialDocumentService.hasDocumentsForProject/Client`), não uma inversão da fronteira de domínio — o módulo Financeiro nunca depende de Project/Client, é o inverso que passou a verificar o Financeiro antes de excluir.

**Impacto futuro**: todo módulo futuro com vínculo a dinheiro (Pedido de Compra vinculado a Fornecedor e a um `FinancialDocument` gerado) segue o mesmo padrão — arquivar nunca perde histórico; excluir só é permitido para entidades sem qualquer vínculo financeiro. Antes de adicionar uma rota `DELETE` a qualquer entidade nova, perguntar explicitamente "isso pode ter histórico financeiro vinculado, hoje ou no futuro?" — se a resposta for sim ou "talvez", a rota é `archive`, não `delete`.

> **Ver também**: `CORE_ARCHITECTURE_DECISIONS.md`, ADR-014 — Sprint 0 estendeu o guard para `Opportunity`/`Proposal` (um nível acima de `Project` na cadeia de conversão), depois de encontrar exclusão física sem checagem em ambos.

---

## ADR-009 — Dashboard consome agregações, nunca contém regra de negócio

**Problema**: colocar lógica de cálculo financeiro (ex.: "isso conta como receita realizada?", "margem direta é receita prevista menos despesa prevista, sem rateio de indiretos") na camada de apresentação (componente React, ou pior, no frontend) significa que a mesma regra de negócio pode divergir entre o dashboard, um relatório exportado, e uma futura API pública — cada consumidor reimplementando a regra à sua maneira, sem uma fonte única de verdade.

**Alternativas consideradas**:
- Cada tela calcula suas próprias métricas a partir de dados brutos recebidos do backend — rejeitado; é exatamente o anti-padrão que causa divergência entre telas.
- Uma camada de "Analytics" totalmente separada do backend do domínio, com seu próprio pipeline de ETL — apropriado em escala muito maior (ver `ARCHITECTURE_ROADMAP.md`), prematuro para o volume atual.
- Services de agregação no backend (`financialDashboardService`, `projectFinancialSummaryService`), cada regra definida uma vez, dashboard e qualquer consumidor futuro leem o mesmo resultado — a escolhida.

**Solução escolhida**: toda métrica financeira (receita prevista/recebida, despesa prevista/realizada, saldo, margem direta) é calculada uma única vez em um service de agregação no backend. O componente de dashboard no frontend só formata e renderiza o que o service já calculou — nenhuma soma, subtração, ou decisão de "isso conta como X" acontece em `.tsx`.

**Justificativa**: mantém uma única fonte de verdade para "o que significa margem direta" — documentada explicitamente no código do service (`projectFinancialSummary.service.ts`: "Deliberadamente 'direta': nenhuma alocação de custo indireto é aplicada aqui — rateio de despesas é fora de escopo. Nunca rotular isso de 'lucro' na UI sem qualificar"). Essa nota só faz sentido por existir num único lugar.

**Impacto futuro**: "Analytics primeiro, Dashboard consome Analytics" é o princípio a preservar conforme o produto cresce — mesmo quando um rollup materializado (ver ADR-011 e `PERFORMANCE_GUIDE.md`) substituir a agregação em tempo real por leitura de uma coleção pré-computada, a REGRA de cálculo continua vivendo no backend, nunca migra para o frontend. Um futuro módulo de Analytics dedicado herda os services de agregação existentes como sua camada de domínio, não os reescreve.

---

## ADR-010 — Logging estruturado com correlationId e event

**Problema**: logs de auditoria financeira sem estrutura comum (`console.log` de texto livre, formatos ad-hoc por arquivo) são inúteis para investigação em produção — impossível filtrar "todos os eventos desta operação específica" ou "todos os pagamentos rejeitados na última hora" sem parsing manual de texto.

**Alternativas consideradas**:
- Logging não estruturado (texto livre por chamada) — o estado inicial do módulo (RC-1); insustentável em produção.
- `AsyncLocalStorage` global de request, injetando um id de correlação em toda a aplicação automaticamente — mais completo, mas é infraestrutura de escopo de app inteiro; fora do escopo de uma sprint de hardening de um módulo específico.
- `correlationId` gerado explicitamente por operação, propagado manualmente pela cadeia de chamadas (service → repository → retry) — a escolhida, deliberadamente mais simples que a `AsyncLocalStorage` global.

**Solução escolhida**: todo log de auditoria financeira carrega:
- `correlationId` — UUID gerado uma vez por operação, propagado explicitamente até `withTransactionRetry`.
- `event` — string estável e padronizada: `payment_created`, `payment_rejected`, `duplicate_attempt`, `document_created`, `document_cancelled`, `retry_executed`, `retry_exhausted`, `transactional_conflict`, `unexpected_error`.
- `timestamp` (via `pino`, automático em todo log).
- `workspaceId` sempre presente quando aplicável.

Nenhum log inclui segredos, tokens, ou números de conta — apenas IDs internos (ObjectId) e valores monetários formatados via `formatCentsBRL` (nunca centavos crus sem contexto).

**Justificativa**: um `event` estável e um `correlationId` transformam "grep em texto livre" em "filtro estruturado" — a diferença entre depurar um incidente em minutos ou em horas. O `correlationId` explícito (em vez de `AsyncLocalStorage`) foi uma escolha consciente de escopo: resolve o problema real (rastrear uma operação financeira ponta a ponta) sem construir infraestrutura de request-tracing para o app inteiro dentro de uma sprint de hardening de um módulo.

**Impacto futuro**: todo módulo novo usa o mesmo vocabulário de `event` (verbo_substantivo, snake_case, estável — nunca renomear um `event` existente, é uma métrica implícita) e o mesmo padrão de `correlationId` explícito por operação. Se um dia a aplicação inteira precisar de rastreamento de request de ponta a ponta (não só por módulo), a migração para `AsyncLocalStorage` é um ADR novo, não uma extensão silenciosa deste padrão.

> **Ver também**: `CORE_ARCHITECTURE_DECISIONS.md`, ADR-012 — Sprint 0 promoveu este padrão de "convenção do Financeiro" a "padrão oficial do app" (`src/lib/auditLog.ts`), depois de encontrar três padrões de log parciais coexistindo sem unificação (achado C do Anexo abaixo).

---

## ADR-011 — Desnormalização é decidida por medição, não por intuição

**Problema**: denormalizar um campo (copiar um valor de uma coleção relacionada para evitar um `$lookup` em tempo de leitura) troca simplicidade de escrita por velocidade de leitura — mas às vezes o `$lookup` que parece "só mais um join" é, na prática, uma diferença de 200x em latência. Decidir isso por intuição ("provavelmente fica mais rápido") arrisca tanto otimizar prematuramente onde não importa quanto deixar de otimizar onde importa muito.

**Alternativas considereadas**:
- Nunca denormalizar, sempre `$lookup` — mais simples de raciocinar, mas RC-3.3 mediu 30 segundos numa página de detalhe de projeto a apenas 100 mil pagamentos no workspace — não é uma otimização acadêmica, é uma página que estoura timeout num volume de dados plausível.
- Denormalizar tudo preventivamente — risco de duplicar dados que na prática nunca é lido no caminho quente, aumentando superfície de manutenção (todo campo denormalizado precisa de uma prova de que nunca pode divergir da origem) sem ganho real.
- Denormalizar apenas campos medidos como gargalo real, com prova explícita de que o campo é imutável após a criação do documento de origem (condição necessária para nunca divergir, já que os registros aqui são append-only) — a escolhida.

**Solução escolhida**: `Payment.direction` (RC-2.5) e `Payment.projectId` (RC-3.3) são cópias denormalizadas de `FinancialDocument.direction`/`.projectId`, cada uma justificada por medição real antes da implementação, não por estimativa. Ver `PERFORMANCE_GUIDE.md` para os números completos e o processo de decisão passo a passo.

**Justificativa**: as duas únicas condições que tornam uma denormalização segura sem mecanismo de sincronização adicional: (1) o campo de origem é imutável após a criação do documento pai, e (2) o documento que carrega a cópia nunca é editado depois de escrito (append-only). `FinancialDocument.direction`/`.projectId` são ambos imutáveis por regra de validação (`updateFinancialDocumentSchema` não os aceita); `Payment` é append-only por design (ADR-008). Sem as duas condições simultaneamente, denormalizar introduziria risco de divergência silenciosa — e nesse caso a resposta correta é um rollup mantido ativamente (ver `PERFORMANCE_GUIDE.md`), não uma cópia estática.

**Impacto futuro**: nenhum campo é denormalizado em qualquer módulo futuro sem antes (1) medir o custo real da alternativa sem denormalização contra dados em volume realista, e (2) confirmar as duas condições de segurança acima. `PERFORMANCE_GUIDE.md` formaliza esse processo como checklist obrigatório.

---

## ADR-019 — Financial Document Ownership: lock de origem genérico

**Status**: `ACCEPTED` — ratificada em 2026-07-16 após Domain Review, Architecture Review e Final Hardening. **Architecture Freeze**: SIM — princípio arquitetural congelado, não mais específico de Compras (ver "Princípio arquitetural" abaixo). **Breaking Change**: NÃO. **Supersedes**: Nenhuma. **Superseded By**: Nenhuma. **Review Required**: somente se o significado de domínio do Aggregate `FinancialDocument` mudar. Numeração global (ADR-012 a ADR-018 vivem em `CORE_ARCHITECTURE_DECISIONS.md` e `COMPRAS_ARCHITECTURE_DECISIONS.md` — ver `ARCHITECTURE_GOVERNANCE.md` §1, "numeração sequencial, independente do arquivo").

**Princípio arquitetural que esta ADR estabelece** (aplicável a todo o ArchFlow, não só a Compras): *"Quando uma transição de estado de um Aggregate precisa respeitar um compromisso assumido por outro bounded context, essa condição é expressa como dado opaco gravado pelo contexto de origem no único momento em que ele possui acesso de escrita legítimo ao Aggregate — nunca como uma consulta em tempo real a esse contexto. O Aggregate permanece o único responsável por interpretar e impor essa condição sobre si mesmo."* Chamado, para referência futura, de **Princípio da Autoridade Persistida**.

**Origem**: achado Crítico da Domain Review do módulo Compras (2026-07-16) — um `PurchaseOrder` aprovado pode ficar apontando para um `FinancialDocument` cancelado, sem detecção, porque nada impede o cancelamento direto do documento pela tela Financeiro.

### Problema

`financialDocumentService.cancel()` só bloqueia cancelamento quando `paymentCount > 0` (ADR-008/RC-3.1). Não existe nenhuma noção de "este documento representa um compromisso ainda ativo assumido por outra parte do sistema". Resultado: um `PurchaseOrder.status = "APPROVED"` (que, pela ADR-018 de Compras, significa "gerei um `FinancialDocument` real e correspondente") pode coexistir com `FinancialDocument.isCancelled = true` — o pedido afirma um compromisso que não existe mais, sem log, sem erro, sem forma de detectar exceto auditoria manual cruzando as duas coleções.

### Contexto

O problema nasceu de uma tensão entre duas regras corretas e já congeladas, não de um erro de implementação:

1. **Financeiro nunca importa nada de nenhum módulo de produto** (`DOMAIN_GUIDE.md` §6) — Financeiro precisa continuar podendo ser a folha da árvore de dependências, sem saber que "Compras" existe como conceito.
2. **`PurchaseOrder.status = APPROVED` é uma invariante forte**, não uma sugestão (ADR-018 de Compras) — uma vez aprovado, o pedido afirma categoricamente que um `FinancialDocument` vivo existe.

O padrão de guard já usado no resto do app (`PROJECT_HAS_FINANCIAL_HISTORY`, RC-2.3/CORE-2) resolve a direção oposta: o módulo **upstream** (Projeto, Oportunidade) consulta Financeiro **antes de se autodestruir**. Aqui o problema é invertido — é o módulo **leaf** (Financeiro) que muda de estado, e é o módulo **upstream** (Compras) que fica inconsistente. O padrão existente não cobre essa direção, e replicá-lo ao contrário (Financeiro consulta Compras antes de cancelar) violaria a regra 1.

### Ownership do Aggregate vs. Authority sobre transições de estado

Esta ADR depende de uma distinção que precisa estar explícita, para não ser mal lida em cinco anos:

- **Ownership do Aggregate** é estrutural e nunca muda: o módulo Financeiro é, e permanece, o único proprietário do Aggregate `FinancialDocument` — schema, persistência, e a responsabilidade de impor todos os seus próprios invariantes. Nenhum outro módulo lê, escreve, ou decide nada sobre `FinancialDocument` além do que o próprio Financeiro expõe como API pública. Isso não é alterado por esta ADR.
- **Authority sobre uma transição específica** é condicional e pode ser delegada — não ao módulo de origem diretamente (Financeiro não "pergunta" a ninguém, ver §Decisão), mas a um **dado que o próprio Aggregate carrega sobre si mesmo** (`originLocked`), gravado pela origem no único momento em que ela tem acesso de escrita legítimo (a criação do documento). A partir daí, é o próprio `FinancialDocument` — e só ele — quem consulta esse dado e recusa a transição. A origem nunca é consultada em tempo de cancelamento; ela já disse o que precisava dizer, uma vez, no momento da criação.

Formulação de referência para qualquer texto futuro sobre este tema: *"O módulo Financeiro permanece proprietário do Aggregate `FinancialDocument`. Determinadas transições podem exigir autorização do contexto de origem, expressa através de metadados persistidos no próprio Aggregate no momento da criação — nunca através de uma consulta em tempo real a outro módulo."* Evitar formulações como "Financeiro é dono do ciclo de vida" isoladamente, sem a segunda frase — sozinha, ela não distingue posse de autoridade sobre uma transição, e é exatamente essa distinção que sustenta toda a decisão.

### Alternativas consideradas

- **Financeiro importa/consulta Compras antes de cancelar** — resolveria o problema diretamente, mas viola a regra congelada de dependência unidirecional; descartada por restrição explícita, não por preferência.
- **Coleção neutra de "referências ativas"** (`document_references`, escrita por qualquer módulo, lida por Financeiro antes de cancelar) — mantém a direção de dependência correta (Financeiro só lê uma coleção genérica, não importa nenhum módulo específico), mas introduz uma peça de infraestrutura nova inteira — mais uma coleção, mais um índice, mais uma camada de leitura — para resolver algo que um campo no próprio agregado já resolve. Mesmo raciocínio que descartou lock distribuído na ADR-004: não reaproveitar uma peça de infraestrutura maior quando o documento já dá o que precisamos.
- **Reconciliação assíncrona** (um job/relatório que compara periodicamente `PurchaseOrder.status = APPROVED` contra `FinancialDocument.isCancelled`) — detecta o problema depois, não o previne; não fecha a invariante em tempo real, só produz um relatório de auditoria a posteriori. Pode coexistir com a solução escolhida como camada extra de observabilidade, mas sozinha não resolve a garantia de domínio.
- **Fundir `FinancialDocument` num aggregate maior com sub-documentos de compromissos externos** — já avaliada e descartada por RC-3.9/ADR-004 como reescrita grande demais para o problema que motiva; mesma decisão se aplica aqui, não reabrir.
- **Campo genérico de origem no próprio `FinancialDocument`, interpretado somente por Financeiro** — a escolhida. Detalhada abaixo.

### Decisão

`FinancialDocument` ganha três campos próprios, opcionais, aditivos:

```
originType   String?   // ex.: "PurchaseOrder" — string livre, não enum fechado
originId     String?   @db.ObjectId   // id do agregado de origem, opaco para Financeiro
originLocked Boolean   @default(false)
```

**A regra central**: Financeiro nunca resolve `originId` contra nenhuma coleção, nunca importa nada para interpretar `originType`, e nunca chama nenhum outro módulo. Ele só lê o `Boolean` que já é seu. Quem escreve esses campos é o módulo de origem, no momento em que **já tem acesso de escrita** ao `FinancialDocument` — porque é ele quem está criando o documento, pela mesma via de composição transacional que Compras já usa hoje (ADR-017 de Compras, o parâmetro `db` opcional de `createWithInstallments`). Não é Financeiro perguntando a Compras "posso cancelar?" — é Compras, no ato de criar o documento, deixando escrito nele mesmo "este documento nasceu comprometido".

**O que `originLocked` significa — e o que não significa.** `originLocked = true` **não** significa "documento imutável". Significa, precisa e apenas: *"o Aggregate exige autorização do contexto de origem antes de permitir a transição `isCancelled: false → true`."* Nenhuma outra transição é afetada — `description`, `notes`, `categoryId`, `costCenterId` continuam editáveis via `update()` exatamente como hoje, independentemente do valor de `originLocked` (o problema original era especificamente sobre cancelamento, e a solução é escopada exatamente a esse mesmo tamanho, não mais). Um documento travado não é um documento congelado; é um documento com uma transição condicionada.

`originType` é `String?` livre, não um enum Prisma fechado — um enum obrigaria alterar o schema de Financeiro toda vez que um módulo novo (Contratos, Portal, Integrações, IA) precisasse gerar documentos, o que é exatamente o tipo de acoplamento que a regra de dependência unidirecional existe para evitar. Não existe motivo técnico real para um enum aqui: o campo nunca é usado em nenhuma cláusula `where` de lógica de negócio (só `originLocked` é), então não há ganho de correção/performance em fechá-lo — só custo de acoplamento. `String` livre é, portanto, parte deliberada da estratégia de evolução da plataforma para este campo especificamente: o vocabulário de "quem pode ser origem de um `FinancialDocument`" nunca precisa estar completo no momento em que Financeiro é escrito. O campo é usado só para exibição/auditoria (rastreabilidade humana: "por que este documento está travado, e por quem"), nunca por lógica de negócio — a única coisa que decide comportamento é `originLocked`.

`cancelIfNoPayments` (ou equivalente) ganha uma segunda precondição, do mesmo jeito que já tem a checagem de pagamentos: se `originLocked = true`, recusa com uma mensagem genérica e sem menção a nenhum módulo específico ("este documento está vinculado a um compromisso externo ativo; libere o vínculo primeiro") — Financeiro não sabe, nem precisa saber, que esse vínculo é um `PurchaseOrder`. A checagem, a recusa, e a mensagem são código do próprio Financeiro, executado inteiramente dentro do próprio Aggregate — nunca uma chamada de saída.

**Justificativa**: isto não é uma solução nova inventada para este problema — é a mesma primitiva que Financeiro já usa para `projectId`/`supplierId`/`clientId`/`costCenterId` desde a Release 1.0: um escalar opaco, referenciando outro bounded context, sem `@relation` obrigatória, sem import, interpretado como dado passivo. A única diferença é que aqui um dos campos (`originLocked`) **também** influencia uma decisão de Financeiro — mas essa decisão usa exclusivamente um dado que já é seu, gravado por quem tinha autoridade para gravá-lo no momento da criação. Nenhuma nova direção de dependência é criada.

### Regras do domínio

- **Ownership**: o módulo Financeiro é o único proprietário do Aggregate `FinancialDocument`, em todo momento, sem exceção — isso não muda com esta ADR, e nenhuma regra abaixo altera esse fato. O que esta ADR introduz é autoridade condicional sobre uma transição específica, nunca posse compartilhada do Aggregate.
- **Authority sobre o cancelamento**: pertence, por padrão, ao próprio Financeiro (mesma regra de hoje: qualquer usuário com `delete:financial-documents`, bloqueado se houver pagamento). Quando `originLocked = true`, essa autoridade fica condicionada a uma autorização prévia do contexto de origem — expressa unicamente pelo valor do campo, nunca por uma consulta em tempo real.
- **Documento criado manualmente** (tela Financeiro, fluxo já existente) → `originType: null`, `originLocked: false` → nenhuma condição adicional, comportamento idêntico ao atual, zero mudança percebida.
- **Documento criado por outro domínio** (Compras hoje; Contratos/Portal/Integrações/IA amanhã) → a origem decide, no momento da criação, o valor de `originLocked` — não há default automático "sempre travado": um documento gerado automaticamente mas que não representa um compromisso rígido (ex.: uma sugestão que o usuário ainda pode livremente descartar, ou um documento histórico importado) pode nascer com `originLocked: false`, mesmo tendo `originType` preenchido para fins de rastreabilidade.
- **Quem pode cancelar**: qualquer usuário com `delete:financial-documents`, sujeito às regras já existentes (bloqueado se houver pagamento) **e**, quando `originLocked = true`, bloqueado até a condição abaixo ser satisfeita.
- **Quem pode satisfazer essa condição (liberar a autorização)**: só o módulo de origem, escrevendo `originLocked: false` pela mesma via de escrita que já usa para compor com Financeiro — nunca uma ação unilateral de Financeiro, e nunca uma consulta de Financeiro a esse módulo.
- **Override manual**: reservado a `OWNER` (não `ADMIN`, não `delete:financial-documents` sozinho) — uma escotilha de emergência deliberadamente rara, com evento de auditoria que marca explicitamente que foi override manual, não liberação da origem, para nunca confundir os dois na trilha de auditoria.
- **Quando a autorização do contexto de origem deixa de ser exigida**: quando `originLocked` volta a `false` — seja porque a origem liberou deliberadamente, seja por override de `OWNER`. Financeiro nunca deixou de ser o dono do documento neste intervalo; apenas uma de suas transições esteve condicionada.

### Tabela de comportamento (oficial — elimina interpretação subjetiva)

| Origem | `originLocked` | Financeiro pode cancelar diretamente? | Quem autoriza a liberação? |
|---|---|---|---|
| Manual (tela Financeiro) | `false` | Sim, sem condição adicional | Financeiro (regra já existente: bloqueado só se houver pagamento) |
| `PurchaseOrder` (Compras) | `true` | Não | Compras, ao liberar o vínculo (ex.: fluxo futuro de cancelamento de pedido aprovado) |
| Contrato | `true` | Não | Módulo de Contratos, ao encerrar/liberar o contrato |
| API Externa / Integração | `true` | Não | O sistema de integração, ao desfazer a operação de origem |
| Importação histórica (ex.: conciliação bancária) | `false` | Sim, sem condição adicional | Financeiro — origem preenchida só para rastreabilidade, sem exigir proteção |
| Sugestão de IA (não confirmada por humano) | `false` | Sim, sem condição adicional | Financeiro, até confirmação humana promover o documento a `true` |
| Qualquer origem, após override | `false` (após override) | Sim | `OWNER` já exerceu o override; evento de auditoria registra que não foi a origem quem liberou |

Duas linhas com `originLocked: false` mas `originType` preenchido (Importação, IA não confirmada) existem deliberadamente na tabela: demonstram que "ter origem" e "exigir autorização para cancelar" são independentes — o campo de rastreabilidade nunca implica proteção automática.

### Aggregate

`FinancialDocument` continua sendo o único Aggregate responsável por todos os seus próprios invariantes — isto não muda com `originLocked`. A checagem do novo campo acontece dentro do mesmo método que já checa `paymentCount > 0` (`cancelIfNoPayments`), com a mesma forma: uma condição a mais no mesmo guard, avaliada com dados que já pertencem ao próprio documento. Nenhum código externo ao Financeiro decide, impõe, ou verifica essa regra — `originLocked` é um dado de entrada para o Aggregate, no mesmo sentido em que `isCancelled` ou a lista de `installments` já são. A responsabilidade não é redistribuída; a superfície de dados que o Aggregate já usa para se autogovernar apenas cresce em um campo.

### Dependências (revalidação explícita)

Nenhuma dependência implícita ou acoplamento indireto encontrado:

- **Financeiro não depende de Compras**: confirmado — `originType`/`originId`/`originLocked` são escritos pela origem através da API pública já existente de Financeiro (mesma via que já escreve `supplierId`/`categoryId`), nunca lidos por Financeiro através de um import ou chamada a Compras.
- **Compras não depende de nada novo em Financeiro**: a única mudança do lado de Compras é passar três campos a mais numa chamada que já faz hoje (`createWithInstallments`) — não é uma dependência nova, é uso mais completo de uma dependência que já existe e já é sancionada (ADR-017).
- **Nenhum ciclo**: o fluxo de dados é estritamente Compras → Financeiro na escrita (criação e liberação do lock) e Financeiro → ninguém na leitura/decisão (o cancelamento é decidido inteiramente dentro de Financeiro). Não existe nenhum caminho em que Financeiro chama Compras, direta ou indiretamente.
- **RBAC do override (`OWNER`)** não introduz acoplamento — `OWNER` é um papel de workspace já global, ortogonal a qualquer módulo específico.

### Estados

Nenhum estado novo é introduzido em nenhuma máquina de estados. `FinancialDocument.isCancelled` continua sendo o único booleano de estado relevante; `originLocked` é uma **precondição de transição**, não um estado — mesmo espírito do guard condicional já usado no `where`-clause da ADR-004, não uma expansão da máquina de estados. `PurchaseOrder` não precisa de nenhuma mudança — ele continua com seus três estados (`DRAFT`/`APPROVED`/`CANCELLED`, ADR-018), sem ficar sabendo que essa proteção existe do outro lado.

### Impacto

- **Financeiro**: três campos opcionais aditivos (nenhum documento existente é afetado — todos nascem com `originType: null`/`originLocked: false` por default, preservando 100% do comportamento atual); uma precondição nova em `cancelIfNoPayments`; uma regra de RBAC nova (override restrito a `OWNER`).
- **Compras**: ganha a opção (não obrigação retroativa — Fase 1 já implementada continua válida sem alteração até que isto seja de fato implementado) de setar `originLocked: true` em `approve()`; quando "cancelar `PurchaseOrder` aprovado" for desenhado no futuro (explicitamente fora de escopo da Fase 1, ADR-018), esse fluxo passa a incluir liberar o lock antes de chamar o cancelamento do documento.
- **Analytics/Dashboard**: nenhum impacto de comportamento — os campos são passivos para leitura agregada; podem virar dimensão de relatório futuro ("documentos por origem") como oportunidade, não obrigação.
- **Portal do Cliente**: nenhum impacto — dimensão ortogonal. Portal lida com escopo de visibilidade (`clientId`, ADR de segunda dimensão de escopo já prevista no roadmap); lock de cancelamento é sobre autoridade de escrita, não sobre quem pode ver.
- **Integrações/IA**: mesma via genérica de qualquer origem futura — nenhum trabalho extra de modelagem quando chegarem. Para IA especificamente, a convenção recomendada (não uma regra imposta pelo schema) é nascer com `originLocked: false` até confirmação humana, e só então transicionar para `true` — mesma primitiva, uso mais cauteloso.

### Generalização

A pergunta relevante para qualquer módulo futuro nunca é "esta ADR precisa mudar para me acomodar" — é só "meu documento representa um compromisso que Financeiro não deveria poder desfazer sozinho?". Testado explicitamente contra todo o conjunto pedido, sem nenhuma alteração ao modelo:

- **Compras**: `originType: "PurchaseOrder"`, `originLocked: true` (já coberto acima e na tabela).
- **Contratos**: `originType: "Contract"`, `originLocked: true` enquanto o contrato estiver ativo.
- **Portal do Cliente**: ortogonal — Portal resolve *quem pode ver* (dimensão de escopo por `clientId`, já prevista no roadmap), não *quem pode cancelar*. Se o Portal um dia permitir ao cliente confirmar algo que gera um `FinancialDocument`, a mesma primitiva se aplica sem fricção.
- **Marketplace**: `originType: "Marketplace"`, mesmo padrão de uma compra confirmada por um fornecedor externo.
- **Integrações / API externa**: `originType: "<nome da integração>"` — a integração decide o lock no momento em que grava o documento pela mesma via de escrita.
- **Importação histórica** (ex.: conciliação bancária, OFX): caso interessante porque demonstra a flexibilidade do modelo — `originType` preenchido para rastreabilidade, mas `originLocked: false`, porque um documento importado não representa um compromisso *ativo* de nenhum sistema vivo; é só dado histórico com proveniência registrada.
- **IA**: `originType: "AI"`, `originLocked: false` até confirmação humana — o mesmo campo booleano serve tanto para "proteger imediatamente" quanto para "proteger só depois de um gate humano", sem precisar de um terceiro estado.

Nenhum desses casos exige um campo novo, um enum novo, ou uma regra nova em Financeiro — todos se encaixam nos três campos já definidos. A única limitação real é a já documentada em Compatibilidade (uma origem por documento), e ela se aplica igualmente a todos, não é específica de nenhum.

### Compatibilidade

Totalmente aditiva e retrocompatível. Nenhum dado existente, contrato de API, ou comportamento muda para qualquer documento sem origem — que é o caso universal hoje (Compras Fase 1 nunca setou esses campos, porque eles ainda não existem). Não contradiz nem reabre nenhuma ADR anterior (001–018); não move nem inverte nenhuma dependência.

**Limite conhecido, aceito deliberadamente**: o modelo suporta uma única origem por documento (campos escalares, não uma lista). Se um cenário futuro genuíno exigir múltiplas origens simultâneas reivindicando o mesmo documento, isso muda o significado do próprio agregado `FinancialDocument` — não é uma lacuna desta ADR, é uma decisão de domínio maior, fora de escopo aqui.

### Limites — o que esta ADR explicitamente não resolve

- **Múltiplas origens simultâneas por documento** — um `FinancialDocument` só pode ter uma origem registrada por vez (campos escalares). Se dois compromissos diferentes precisarem reivindicar o mesmo documento, isso é uma mudança de significado do Aggregate, não uma extensão desta ADR.
- **Ownership compartilhado** — não é resolvido porque não é o problema: esta ADR existe precisamente para que ownership *nunca* seja compartilhado, mesmo quando autoridade sobre uma transição é condicionada.
- **Composição de documentos** — um `FinancialDocument` montado a partir de múltiplos compromissos de origens diferentes (ex.: um documento único cobrindo parte de um `PurchaseOrder` e parte de um Contrato) está fora de escopo — o modelo assume um documento, uma origem.
- **Reversão/estorno** — um documento cancelado (com ou sem lock) continua sem caminho de estorno; essa limitação já existia (`FINANCIAL_DOCUMENT_HAS_PAYMENTS`) e não é alterada aqui.
- **Bloqueio de outras transições além do cancelamento** — `originLocked` nunca se estende a edição de campos mutáveis; um framework genérico de "permissões condicionais por campo" está fora de escopo.
- **Detecção proativa de locks esquecidos** — um lock que nunca é liberado (origem nunca chama release, override nunca é usado) não gera alerta automático; isso seria um relatório operacional futuro, não uma garantia de domínio desta ADR.

### Invariantes garantidas

1. `FinancialDocument` é sempre o único responsável por decidir se uma transição sua pode ocorrer — nenhuma decisão de cancelamento depende de código fora do próprio Aggregate.
2. Ownership do Aggregate `FinancialDocument` nunca muda, independentemente de origem, tipo de origem, ou valor de `originLocked`.
3. Um documento com `originLocked = true` só pode ser cancelado por exatamente dois caminhos: a origem liberando o lock, ou override explícito de `OWNER` — nunca por um terceiro caminho.
4. Financeiro nunca importa, nunca chama, e nunca consulta em tempo real nenhum outro bounded context para decidir uma transição própria.
5. `originLocked` afeta exclusivamente a transição de cancelamento — nenhuma outra transição do documento é condicionada por ele.
6. Todo documento sem origem registrada (`originType: null`) se comporta exatamente como antes desta ADR existir, sem exceção.
7. Ausência de lock é sempre seguro por padrão (`originLocked: false`) — nenhuma origem trava um documento sem decidir isso explicitamente no momento da criação.

### Anti-patterns — nunca implementar

- **Financeiro importar qualquer módulo de produto para resolver `originId` ou checar estado de origem.** Viola `DOMAIN_GUIDE.md` §6 diretamente — é exatamente o problema que esta ADR existe para fechar sem cometer.
- **Resolver `originId` consultando outro módulo, mesmo só leitura.** Mesmo uma consulta "inofensiva" (ex.: buscar o nome do pedido para exibir) reintroduz a dependência de import na direção proibida. Resolução de exibição é responsabilidade do frontend, que já tem acesso a ambos os módulos — nunca do backend de Financeiro.
- **Criar um enum fechado para `originType`.** Obrigaria alterar o schema de Financeiro a cada módulo novo — o oposto do que a decisão existe para permitir.
- **Ramificar lógica de negócio por valor de `originType` dentro de Financeiro** (`if (originType === "PurchaseOrder") {...}`). Reintroduziria conhecimento de um módulo de produto dentro de Financeiro pela porta dos fundos. A única coisa que Financeiro pode ler é `originLocked`; `originType` é estritamente de exibição/auditoria.
- **Chamadas síncronas entre bounded contexts para validar um cancelamento** (ex.: Financeiro chamando um endpoint interno de Compras "posso cancelar?"). Reintroduz acoplamento em tempo de execução e um ponto de falha distribuído para uma decisão que deve ser local e instantânea.
- **Gravar `originLocked` fora da mesma transação que cria o documento.** Quebraria a atomicidade que a composição transacional (ADR-017) já garante — lock e documento devem nascer juntos, nunca em passos separados que reabrem uma janela de corrida.
- **Usar `originLocked` para bloquear qualquer transição além do cancelamento.** Expandir o escopo do campo silenciosamente reabre exatamente a ambiguidade que o Final Hardening desta ADR fechou.
- **Tratar o override de `OWNER` como caminho normal de operação.** Se um fluxo de produto passa a depender rotineiramente do override, o sintoma real é que a origem deveria estar liberando o lock pela via normal — a resposta é corrigir a origem, nunca facilitar o override.

### Consequências — decisões futuras que passam a seguir esta ADR automaticamente

Nenhum módulo futuro que gere um `FinancialDocument` precisa de uma ADR própria para resolver "como não deixar Financeiro cancelar por baixo do meu pé" — a resposta já está decidida aqui, de uma vez por todas:

- **Contratos**, **Marketplace**, **Integrações** (incluindo a fase de conciliação bancária/Open Finance já prevista no roadmap) e **Importações**: usam a mesma primitiva (`originType`/`originId`/`originLocked`) sem exceção nem extensão.
- **Portal do Cliente**: se algum dia gerar um `FinancialDocument` diretamente (hoje só lê), usa a mesma primitiva — ortogonal à dimensão de escopo por `clientId` já prevista.
- **IA**: usa a mesma primitiva, com a convenção (não regra de schema) de nascer com `originLocked: false` até confirmação humana.
- **Analytics/Dashboard**: nenhuma consequência de comportamento — ganham campos adicionais disponíveis para leitura, se quiserem, nunca uma obrigação.
- **API Pública** (quando existir, per `ARCHITECTURE_GOVERNANCE.md` §6.3): qualquer integração externa que gere documentos financeiros o faz através de um serviço interno do ArchFlow que já teria acesso de escrita — a mesma primitiva se aplica, mediada pelo mesmo backend que já intermedeia todo acesso externo hoje.

### Roadmap (sem implementação nesta Sprint)

1. Adicionar `originType`/`originId`/`originLocked` ao schema de `FinancialDocument` — aditivo, sem backfill (defaults cobrem todo dado existente).
2. Adicionar a precondição de `originLocked` em `cancelIfNoPayments`.
3. Adicionar a regra de override restrito a `OWNER`, com evento de auditoria dedicado (`document_cancel_override_by_owner`, distinto de `document_cancelled` normal).
4. Compras: `purchaseOrder.repository.ts#approve` passa a setar `originType: "PurchaseOrder"`, `originId: po.id`, `originLocked: true` ao chamar `createWithInstallments`.
5. Eventos novos: `document_locked_by_origin`/`document_unlocked_by_origin` (via `auditLog`, não `AutomationKey` — mesmo raciocínio da ADR-017: isto é rastro de auditoria, não automação opcional); `document_cancel_rejected` ganha um novo valor de `reason` (`"LOCKED_BY_ORIGIN"`) em vez de um evento novo — aditivo, não renomeia nada existente (ADR-010).
6. Esta lista não é um compromisso de sprint — é o registro de "o que fica pronto para ser implementado quando a decisão for acionada", conforme pedido nesta revisão.

> **Ver também**: `COMPRAS_ARCHITECTURE_DECISIONS.md` — esta ADR resolve o achado Crítico da Domain Review de Compras (2026-07-16); a implementação, quando ocorrer, deve atualizar a tabela de status daquele documento.

---

## Anexo — Revisão de Consistência do Código Atual (Release 1.0, Parte 6)

Revisão somente-leitura de todo o backend, comparando os padrões congelados acima (ADR-001 a ADR-011) contra o resto da aplicação — não só o módulo Financeiro. Nenhum código foi alterado nesta revisão; achados aqui eram backlog documentado no momento da Release 1.0.

> **Atualização — Sprint 0 (Core Architecture Alignment, 2026-07-15)**: os achados A, B, C e E abaixo foram corrigidos nesta sprint (ver `CORE_ARCHITECTURE_DECISIONS.md`, ADR-012 a ADR-015, e o relatório da Sprint 0). Marcados **[RESOLVIDO — Sprint 0]** onde aplicável. D e o item de menor prioridade em E (`media.repository.ts#reorder`) permanecem em aberto, deliberadamente — ver justificativa em cada um.

### A. Escopo por workspaceId — mesma classe de lacuna encontrada fora do Financeiro (ADR-006) — **[RESOLVIDO — Sprint 0, ver ADR-015]**

A RC-3.7 encontrou e corrigiu dois métodos do próprio módulo Financeiro que filtravam por um `id` sem também escopar por `workspaceId` na query (seguros na prática, porque o chamador já validava — mas inconsistentes com o padrão). A mesma classe de lacuna existe, **não corrigida**, fora do Financeiro:

| Local | Achado |
|---|---|
| `src/repositories/media.repository.ts:12-33` | `findById`/`update`/`delete` de `ProposalMedia` filtram só por `id`+`proposalId`, sem `workspaceId` (o modelo nem tem esse campo — exigiria join por `proposalId`). |
| `src/repositories/briefing.repository.ts:5-19` | `Briefing` idem — chaveado só por `opportunityId`. |
| `src/repositories/status.repository.ts:11-16` | `getHistory` de `ProposalStatusHistory` filtra só por `proposalId`, e o próprio caminho de escrita irmão no mesmo arquivo (`updateProposalStatus`) já escopa por workspace — inconsistência visível dentro de um único arquivo. |

Contraexemplo positivo (o padrão já existe organicamente fora do Financeiro, não foi inventado por ele): `src/repositories/document.repository.ts:77-94` já faz um re-check explícito de workspace antes de um `update()`, com comentário explicando a limitação do Prisma/Mongo que motiva o padrão — evidência de que a disciplina do ADR-006 converge naturalmente quando alguém pensa no problema, mesmo sem uma regra escrita até agora.

**Recomendação (histórica)**: aplicar a mesma correção de defesa em profundidade da RC-3.7 aos três locais acima antes ou durante a Sprint de Compras. **Feito na Sprint 0** — os três repositories agora filtram por relação com o pai (`proposal: { workspaceId }` / `opportunity: { workspaceId }`); ver ADR-015.

### B. Exclusão física sem guard — mesmo risco do RC-2.3, um salto acima na cadeia — **[RESOLVIDO — Sprint 0, ver ADR-014]**

`Project`/`Client` têm exclusão física bloqueada quando há `FinancialDocument` vinculado (RC-2.3). Duas entidades a montante na mesma cadeia de conversão (Oportunidade → Proposta → Projeto) **não** têm o guard equivalente:

- `src/services/opportunity.service.ts:130-133` — exclui `Opportunity` sem checar se ela já gerou um `Project` (`Project.opportunityId` é uma relação real, sem cascade). Excluir uma oportunidade convertida deixa `Project.opportunityId` órfão — e esse projeto pode ter `FinancialDocument`s vinculados.
- `src/services/proposal.service.ts:47-51` — mesmo padrão: exclui `Proposal` sem checar `Project.proposalId`.

Os quatro repositories de biblioteca de conteúdo de proposta (`proposal-block`, `proposal-narrative`, `proposal-section`, `proposal-template`) também fazem hard-delete apesar de terem `isArchived` — mas isso é uma **exceção deliberada e documentada** no próprio schema (`ProposalSectionInstance.blockId`/`sectionId` são escalares sem `@relation` de propósito, exatamente para que editar/arquivar um bloco de biblioteca nunca mude uma proposta que já o "fotografou"). Não é o mesmo risco do histórico financeiro — não precisa de correção.

**Recomendação (histórica)**: estender o guard de referência do RC-2.3 (`hasDocumentsForProject/Client`) para `Opportunity`/`Proposal`. **Feito na Sprint 0** — `OPPORTUNITY_HAS_PROJECT`/`PROPOSAL_HAS_PROJECT`; ver ADR-014.

### C. Logging estruturado — o padrão do Financeiro é uma ilha — **[PARCIALMENTE RESOLVIDO — Sprint 0, ver ADR-012]**

`correlationId` (`src/lib/correlationId.ts`) é, por design explícito no próprio código, exclusivo do módulo Financeiro. Existe um padrão **diferente e mais antigo** de evento estruturado (`src/lib/events.ts`, `emitEvent`/`{ event, ...ctx }`) usado em Auth e nos services de IA — mas sem `correlationId`, e com entradas de catálogo (`ProposalEvent.created/updated/deleted/status_changed`) que nunca são de fato emitidas em lugar nenhum (código morto de catálogo). Billing (`billingWebhook.service.ts`) ainda loga com prefixo de texto livre (`"[billing] ..."`), sem `event` nem correlação.

**Recomendação (histórica)**: decidir qual padrão parcial vira o oficial do app inteiro, via ADR novo de escopo de aplicação. **Feito na Sprint 0** (ADR-012, `CORE_ARCHITECTURE_DECISIONS.md`) — `auditLog()` (`src/lib/auditLog.ts`) é agora o padrão único, com o Financeiro migrado para usá-lo. **Ainda em aberto**: `events.ts` (Auth/IA) e os logs de texto livre de Billing não foram migrados nesta sprint — marcados como padrão legado, migração gradual na próxima vez que esses arquivos forem tocados por outro motivo, não como projeto isolado (ver ADR-012, "Impacto futuro").

### D. Dinheiro fora do Money Library — tensão real com o ADR-001 "sem exceção"

O ADR-001 (congelado) nomeia explicitamente "faturas de assinatura" como adotante futuro do padrão BigInt/centavos "sem exceção". Na prática:

- `BillingHistory.amount`/`BillingPlan.priceMonthly`/`.priceAnnual` (schema) são `Float`, não `BigInt` — billing é anterior às sprints de hardening do Financeiro e nunca foi migrado.
- Billing não duplica lógica de arredondamento própria (repassa o valor que vem do Mercado Pago), então não há um segundo "toCents" competindo com a Money Library — é uma lacuna de tipo, não de lógica duplicada.
- Dois outros pontos fazem arredondamento monetário manual fora da Money Library, ambos sobre dados pré-contrato (estimativas, nunca lançamentos reais): `src/utils/calculations/pricing.ts` (`round2()`, `Math.round(n*100)/100`) e `src/services/opportunity.service.ts` (`withWeightedRevenue`, arredondamento inline de receita ponderada por probabilidade).

**Recomendação**: isto é uma lacuna real entre o que o ADR-001 já declara como padrão e o estado atual do schema de billing — não é uma exceção documentada, é dívida técnica pré-existente. Duas opções para a Sprint de Compras/Billing v2: (1) migrar `BillingHistory`/`BillingPlan` para `BigInt` em centavos como um ADR de módulo próprio (billing não é dinheiro do escritório, é dinheiro do ArchFlow cobrando o escritório — mesma disciplina, aggregate diferente), ou (2) declarar formalmente billing como exceção documentada com justificativa (ex.: valores sempre inteiros em reais, nunca fracionários, tornando Float seguro na prática) — mas a decisão precisa ser explícita, não silenciosa. `pricing.ts`/`opportunity.service.ts` são menor prioridade (dados de estimativa, nunca persistidos como ledger).

### E. Retry transacional — o maior achado desta revisão — **[RESOLVIDO — Sprint 0, ver ADR-013]**

`withTransactionRetry()` era usado **somente** pelo módulo Financeiro. Existiam múltiplas transações multi-coleção fora dele, sem retry, incluindo uma disparada diretamente por um webhook de pagamento:

- `src/services/subscription.service.ts:249-259` (`changePlan`, 2 coleções: `workspace` + `subscription`) — chamada a partir de `billingWebhook.service.ts:101` na autorização de um pagamento real do Mercado Pago. **Este era o maior risco encontrado nesta revisão**: uma escrita multi-coleção, financeiramente disparada, exposta ao mesmo `WriteConflict`/`TransientTransactionError` que motivou toda a ADR-003 — sem nenhuma rede de segurança. **Corrigido — CORE-1.**
- `src/services/workspace.service.ts:124-133` (aceite de convite, 2 coleções). **Corrigido — CORE-6.**
- `src/services/proposal.service.ts:25-36` (criação de proposta com cliente novo, 2 coleções — já usava `$transaction` em forma de callback, só faltava o wrapper de retry). **Corrigido — CORE-6.**
- `src/repositories/media.repository.ts:36-44` (`reorder`, 1 coleção — todas as escritas são `proposalMedia.updateMany`, mesma coleção). **Deliberadamente não envolvido** — está fora do critério "múltiplas coleções" que motivou esta ADR; risco residual baixo (mesma coleção, sem risco de inconsistência entre coleções), documentado aqui caso o padrão de reorder ganhe uma segunda coleção no futuro.

**Recomendação (histórica)**: envolver `subscription.service.ts#changePlan` com `withTransactionRetry()` — prioridade alta. **Feito na Sprint 0**, junto com `workspace.service.ts` e `proposal.service.ts` (ver ADR-013).

### F. Estrutura de módulo — convergência confirmada

`src/modules/billing/` segue exatamente a mesma convenção de barrel que `src/modules/financial/` (nenhum dos dois mantém repositories num subdiretório do módulo — ambos usam `src/repositories/*.repository.ts` compartilhado). A divergência de billing (`providers/`, `webhooks/`, `validators/`, `utils/` como subpastas extras) é estrutural — reflete a integração com gateway externo que Financeiro não tem — não uma quebra de padrão. `financial.module.ts` inclusive cita `billing.module.ts` como precedente da convenção de barrel. **Nenhuma ação necessária** — a convenção já está consistente entre os dois módulos existentes, formalizada em `ENGINEERING_STANDARDS.md` para o próximo.

### Resumo priorizado — status pós-Sprint 0

| Prioridade | Achado | Status |
|---|---|---|
| Alta | `subscription.service.ts#changePlan` sem `withTransactionRetry` — webhook de pagamento real sem rede de segurança | **Resolvido — Sprint 0 (CORE-1)** |
| Média | `Opportunity`/`Proposal` sem guard de exclusão física equivalente ao RC-2.3 | **Resolvido — Sprint 0 (CORE-2)** |
| Média | Decidir padrão único de logging estruturado para o app inteiro (ADR novo, escopo de aplicação) | **Resolvido — Sprint 0 (CORE-4)**, migração de Auth/IA/Billing para o novo padrão ainda pendente (gradual, não isolada) |
| Média | `workspaceId` ausente em 3 repositories fora do Financeiro (media, briefing, status) | **Resolvido — Sprint 0 (CORE-3)** |
| Baixa | Billing usa `Float` em vez de `BigInt`/centavos — tensão não resolvida com o ADR-001 | Em aberto — candidato a ADR de módulo próprio quando Billing v2 for trabalhado |
| Baixa | `pricing.ts`/`opportunity.service.ts` arredondam dinheiro fora da Money Library | Em aberto — baixa prioridade, dados são estimativas pré-contrato, não ledger |
