# ArchFlow — Core Module Policy

**Status**: VIGENTE — Sprint 1 (Platform Freeze 2.0), 2026-07-15
**Escopo**: define quais módulos são **fundamentais** (Core) — aqueles cuja mudança estrutural exige processo formal (`ARCHITECTURE_GOVERNANCE.md`) — e as regras de dependência entre eles. Módulos não listados aqui são módulos de produto (CRM, Propostas, Projetos, Reuniões, Documentos, Automações): seguem os mesmos padrões de engenharia (`ENGINEERING_STANDARDS.md`), mas mudanças neles não exigem ADR por padrão.

**Regra de leitura das tabelas**: "Dependências permitidas" = o que este módulo pode importar. "Quem pode depender dele" = quem pode importá-lo. Tudo que não está listado como permitido é proibido — a lista é fechada (allow-list), não aberta.

**Sobre eventos**: ArchFlow não tem barramento de eventos formal (ver `DOMAIN_GUIDE.md` §4). "Eventos publicados" abaixo significa: eventos de auditoria (`auditLog`, ADR-012) e/ou gatilhos do sistema de Automações (`AutomationKey`). "Eventos consumidos" significa: reage a um `AutomationKey` ou lê `AutomationRun`. A maioria dos módulos Core não consome eventos — são folhas ou quase-folhas da árvore de dependências, por design.

---

## Módulos Core

| # | Módulo | Código |
|---|---|---|
| 1 | Authentication | `src/services/auth.service.ts`, `provision.service.ts`, `src/middlewares/auth.ts`, tokens (`RefreshToken`/`ResetPasswordToken`/`EmailVerificationToken`) |
| 2 | Workspace | `src/services/workspace.service.ts`, modelos `Workspace`/`User`/`WorkspaceInvite` |
| 3 | RBAC | `src/middlewares/rbac.ts` (mapa `PERMISSIONS`, `requireWorkspacePermission` etc.) |
| 4 | Finance | `src/modules/financial/`, repositories financeiros, `FinancialDocument`/`Installment`/`Payment` e entidades de referência |
| 5 | Money | `src/lib/money/` |
| 6 | Retry | `src/lib/transactionRetry.ts` |
| 7 | Logging | `src/lib/auditLog.ts`, `src/lib/correlationId.ts`, `src/lib/logger.ts` |
| 8 | Analytics Base | `financialDashboardService`, `projectFinancialSummaryService`, `src/lib/metrics.ts` (a camada de agregação da ADR-009 — precursora do futuro rollup, `PERFORMANCE_GUIDE.md` §3) |

Billing (`src/modules/billing/`) é deliberadamente **não-Core** nesta versão: é um módulo de produto com um contrato externo (Mercado Pago), com sua dívida técnica própria documentada (Float vs BigInt, Anexo D). Vira candidato a Core quando essa dívida for resolvida via ADR própria.

---

## 1. Authentication

**Responsabilidade**: identidade — quem é o usuário. Registro, login (credenciais + Google/Supabase), tokens de sessão/refresh, verificação de e-mail, reset de senha, provisionamento (Supabase → MongoDB).

| | |
|---|---|
| **Dependências permitidas** | `prisma`, `logger`/`auditLog`, `errors`, e-mail (`emailService`), Workspace (só para provisionar o workspace inicial de um usuário novo — `workspaceService.createForUser`) |
| **Dependências proibidas** | Qualquer módulo de produto (Finance, CRM, Propostas...), RBAC (autenticação decide *quem é*, não *o que pode*) |
| **Quem pode depender dele** | Todos — via `withAuth`/`withWorkspace` (middlewares), nunca importando services de auth diretamente em módulos de produto |
| **Eventos publicados** | `AuthEvent` via `events.ts` (legado, ADR-012 — migrar para `auditLog` gradualmente): login, registro, verificação, reset |
| **Eventos consumidos** | Nenhum |

## 2. Workspace

**Responsabilidade**: tenancy — a fronteira de isolamento do ADR-006. Criação de workspace, convites, membros, papéis (atribuição — a *checagem* é RBAC).

| | |
|---|---|
| **Dependências permitidas** | `prisma`, `auditLog`, `errors`, `transactionRetry`, Automations (seed de defaults ao criar workspace), Subscription (criação do trial inicial — dependência histórica, aceita) |
| **Dependências proibidas** | Módulos de produto; Finance |
| **Quem pode depender dele** | Todos — todo modelo de domínio referencia `workspaceId` |
| **Eventos publicados** | `workspace_invite_accepted` (`auditLog`); `WorkspaceEvent` legado via `events.ts` |
| **Eventos consumidos** | Nenhum |

## 3. RBAC

**Responsabilidade**: autorização — o que cada papel pode fazer, expresso como mapa central `verbo:recurso` + middlewares de rota. Única fonte de verdade de permissões (ADR-007).

| | |
|---|---|
| **Dependências permitidas** | Middlewares de auth (`withWorkspace`), `response` |
| **Dependências proibidas** | Qualquer service ou repository — RBAC decide, não executa; nenhuma query de dados dentro do RBAC além do que o middleware de auth já resolveu |
| **Quem pode depender dele** | Toda rota (`src/app/api/**`); nunca importado por services/repositories (a permissão é checada na borda, o service confia que a borda checou E re-escopa por workspace — defesa em profundidade) |
| **Eventos publicados / consumidos** | Nenhum |

**Regra especial**: todo módulo novo ADICIONA entradas ao mapa `PERMISSIONS` — nunca cria um mecanismo de permissão paralelo (precedente: `view:financial-*`, ADR-007).

## 4. Finance

**Responsabilidade**: o ledger do escritório (Título → Parcela → Baixa), fornecedores, contas bancárias, plano de contas, centros de custo. O contexto de referência de toda a plataforma (`DOMAIN_GUIDE.md`).

| | |
|---|---|
| **Dependências permitidas** | `prisma`, Money, Retry, Logging, `metrics`, `dateOnly`, `tenantGuard`, `errors`, `pagination` — só infraestrutura, nenhum módulo de produto |
| **Dependências proibidas** | **Qualquer módulo de produto** (Projetos, Clientes, Propostas, Compras futuro) — a regra de uma via só (`DOMAIN_GUIDE.md` §6): Finance é folha, nada de negócio acima dele o importa como dependência dele |
| **Quem pode depender dele** | Módulos de produto, só para: (a) checagens read-only de referência (`hasDocumentsForProject/Client` — padrão RC-2.3), (b) gerar um `FinancialDocument` via automação (padrão previsto para Compras) |
| **Eventos publicados** | `payment_created`, `payment_rejected`, `duplicate_attempt`, `document_created`, `document_cancelled`, `document_cancel_rejected` (`auditLog`) |
| **Eventos consumidos** | Nenhum hoje; no futuro, `AutomationKey` de Compras (pedido aprovado → gerar documento) — consumo via automação, nunca import direto |

## 5. Money

**Responsabilidade**: toda aritmética monetária (BigInt/centavos), conversão reais↔centavos, validação de teto, formatação para logs (ADR-001). Registra o shim `BigInt.prototype.toJSON`.

| | |
|---|---|
| **Dependências permitidas** | Nenhuma (funções puras + Zod) — é a folha mais profunda da árvore |
| **Dependências proibidas** | Tudo — Money não importa nada do app |
| **Quem pode depender dele** | Todos que tocam dinheiro |
| **Eventos** | Nenhum |

## 6. Retry

**Responsabilidade**: `withTransactionRetry()` — retry com backoff para `WriteConflict`/`TransientTransactionError` em toda escrita multi-coleção (ADR-003/013).

| | |
|---|---|
| **Dependências permitidas** | Logging (`auditLog`), `metrics`, `@prisma/client` (tipos de erro) |
| **Dependências proibidas** | Qualquer service/repository/módulo |
| **Quem pode depender dele** | Todo repository/service com escrita multi-coleção — obrigatório, não opcional (ADR-013) |
| **Eventos publicados** | `transactional_conflict`, `retry_executed`, `retry_exhausted` (`auditLog`) |
| **Eventos consumidos** | Nenhum |

## 7. Logging

**Responsabilidade**: `auditLog()` — formato único de evento de domínio (ADR-012); `correlationId`; o logger pino subjacente.

| | |
|---|---|
| **Dependências permitidas** | `pino` (externo), `node:crypto` |
| **Dependências proibidas** | Qualquer módulo do app (evita ciclo: todos dependem de Logging, Logging não depende de ninguém) |
| **Quem pode depender dele** | Todos |
| **Eventos** | É o *canal* de publicação de eventos de auditoria; não publica nem consome eventos próprios |

**Regra especial**: `event` names são API pública implícita (métricas/alertas dependem deles) — nunca renomear um `event` publicado; adicionar novos é livre.

## 8. Analytics Base

**Responsabilidade**: a camada de agregação (ADR-009) — cada métrica de negócio calculada uma única vez, no backend. Hoje: dashboard financeiro + resumo por projeto + métricas em processo. Futuro: o rollup materializado (`PERFORMANCE_GUIDE.md` §3) e o módulo Analytics do roadmap.

| | |
|---|---|
| **Dependências permitidas** | `prisma` (agregações), Money, `dateOnly`, `metrics`, `tenantGuard` |
| **Dependências proibidas** | Camada de apresentação (obviamente); services de escrita de qualquer módulo — Analytics é somente leitura, nunca escreve em coleções de domínio |
| **Quem pode depender dele** | Rotas de dashboard/relatório; futuro Centro de Inteligência (leitura); frontend via API |
| **Eventos publicados** | Nenhum |
| **Eventos consumidos** | Futuro: eventos de escrita financeira para manter o rollup incremental (quando o gatilho do §3 disparar) |

---

## Mapa de dependências entre módulos Core

```
                    ┌──────────┐
                    │  Money   │  (folha absoluta — não importa nada)
                    └────▲─────┘
                         │
┌─────────┐   ┌──────────┴─┐   ┌─────────┐
│ Logging │◄──┤   Retry    │   │  RBAC   │  (borda de rota — não importa services)
└───▲─────┘   └──────▲─────┘   └────▲────┘
    │                │              │ (usado por toda rota)
    │         ┌──────┴──────────────┴───┐
    ├─────────┤        Finance          │
    │         └──────▲───────────▲──────┘
    │                │ read-only │ (hasDocumentsFor*, padrão RC-2.3)
    │         ┌──────┴────┐ ┌────┴──────────┐
    ├─────────┤ Workspace │ │ Módulos de    │
    │         └─────▲─────┘ │ produto       │
    │               │       │ (CRM, Props,  │
┌───┴──────────┐    │       │  Projetos...) │
│Authentication├────┘       └───────────────┘
└──────────────┘
      Analytics Base lê de Finance (e futuro: outros), nunca escreve.
```

Sem ciclos por construção: Money/Logging não importam nada do app; Retry importa só Logging; Finance importa só infraestrutura; módulos de produto dependem de Finance numa via só e read-only.

---

## Processo para alterar um módulo Core

Qualquer mudança **estrutural** (schema, contrato público de service/repository, semântica de um `event`, regra de dependência desta política) em um módulo Core exige o processo de `ARCHITECTURE_GOVERNANCE.md` — em resumo: ADR antes do código. Mudanças **não estruturais** (bug fix que não muda contrato, teste novo, comentário, log adicional) seguem o fluxo normal de PR (`PULL_REQUEST_GUIDE.md`).

Adicionar um módulo à lista Core (ex.: Billing após resolver a dívida Float→BigInt; Compras após estabilizar) é, ele próprio, uma ADR.
