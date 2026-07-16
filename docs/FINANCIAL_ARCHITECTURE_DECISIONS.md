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
