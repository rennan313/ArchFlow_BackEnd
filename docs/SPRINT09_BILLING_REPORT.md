# Sprint 09 — Sistema de Assinaturas com Mercado Pago · Relatório Final

Implementação da cobrança recorrente via Mercado Pago sobre a "Phase 1 billing
foundation" já existente. Entregue em 3 fases (A backend · B frontend · C
emails+testes), com módulo **desacoplado** (Provider + Service + Repository)
preparado para outros gateways (Stripe/Asaas) sem refatoração.

Branches: `feat/billing-mercadopago-phase-a`, `-phase-b`, `-phase-c` (backend + frontend).

---

## 1. Alterações realizadas

### Backend (`ArchFlow_BackEnd`)
- **Módulo novo `src/modules/billing/`** (gateway-agnóstico):
  - `providers/gateway.interface.ts` — contrato `BillingGatewayProvider`.
  - `providers/mercadoPago/` — `mercadoPago.provider.ts`, `mpClient.ts` (**único ponto de HTTP** com o MP), `mp.types.ts`.
  - `providers/index.ts` — registry de providers.
  - `services/` — `billingCheckout` (cria preapproval + init_point), `billingWebhook` (máquina de estados idempotente), `billingSubscription` (cancel/reactivate no gateway), `billingPlan` (catálogo do BD).
  - `webhooks/mercadoPago.webhook.ts` — verify HMAC → persist-before-process → dispatch → mark.
  - `utils/signature.ts` (HMAC timing-safe), `validators/`, `billing.module.ts` (barrel).
- **Reutilizados/estendidos:** `services/subscription.service.ts` (+`getAccessLevel`, PAUSED em `canWrite`, email de trial expirado, `accessLevel`/período no usage summary), `services/billing.service.ts` (+`receiptUrl`/`rawPayload` no invoice), `repositories/subscription.repository.ts` (+`findByMpSubscriptionId`), **novo** `repositories/billingPlan.repository.ts`.
- **Emails:** `services/email/templates/billing.ts` (layout + 7 templates), 7 métodos em `email.service.ts`, `utils/workspaceOwner.ts` (resolve destinatário).
- **Erros:** `lib/errors.ts` + `utils/serviceError.ts` (BILLING_NOT_CONFIGURED, BILLING_PLAN_NOT_FOUND/NOT_SELLABLE, BILLING_PROVIDER_ERROR, WEBHOOK_SIGNATURE_INVALID).
- **Env:** `lib/env.ts` — `MERCADO_PAGO_*` + `billingEnabled` (degrada graciosamente).
- **Testes:** `src/__tests__/modules/billing/` — webhook state machine, checkout, cancel/reactivate, provider parse+signature (22 testes).

### Frontend (`ArchFlow`)
- **Checkout real** — deletado o mock `lib/billing/paymentProvider.ts`; `app/actions/billing.ts` → `checkoutAction`/`cancelSubscriptionAction`/`reactivateSubscriptionAction`/`getBillingHistoryAction`.
- **Página de Planos** (`/billing/plans`) — consome o catálogo do BD, toggle Mensal/Anual, "Assinar" → redirect ao `init_point`.
- **Portal** (`Configurações → Assinatura`, `/settings/billing`) — reescrito de mock para dados reais (plano, status incl. PAUSED, próxima cobrança, cancelar/reativar, aviso somente-leitura) + histórico financeiro.
- `types/subscription.ts` estendido; label i18n → "Assinatura"/"Subscription"/"Suscripción".

### Controle de acesso (mapa final)
`TRIAL`/`ACTIVE` → acesso total · `PAST_DUE` → somente-leitura · `PAUSED` → limitado · `CANCELED`/`EXPIRED` → somente-leitura + CTA de reativação. Gate único em `withWorkspace` (`canWrite`); apenas `full` escreve.

## 2. "Migrations" (MongoDB — `prisma db push`, sem arquivos de migration)
Mudanças **aditivas** no `prisma/schema.prisma`:
- `enum SubscriptionStatus += PAUSED`
- `model BillingPlan` novo (coleção `billing_plans`, `key @unique`)
- `BillingHistory += receiptUrl?, rawPayload?`

Aplicar por ambiente:
```bash
npx prisma db push
npx tsx prisma/seed-billing-plans.ts   # popula 4 planos a partir de config/plans.ts
```
Índices esparsos únicos (`subscriptions.mpSubscriptionId`, `billing_history.mpPaymentId`): ver `docs/indexes.md` — criar **antes** do primeiro checkout real.

## 3. Rotas novas
| Método | Rota | Auth |
|---|---|---|
| POST | `/api/webhooks/mercadopago` | Pública (HMAC) |
| POST | `/api/billing/checkout` | OWNER (NoBillingGate) |
| GET  | `/api/billing/plans` | Autenticado |
| GET  | `/api/billing/history` | Workspace |
| POST | `/api/subscription/cancel` | OWNER (NoBillingGate) |
| POST | `/api/subscription/reactivate` | OWNER (NoBillingGate) |

## 4. Variáveis de ambiente (Railway backend)
```
MERCADO_PAGO_ACCESS_TOKEN=      # APP_USR-... (prod) / TEST-... (sandbox)
MERCADO_PAGO_PUBLIC_KEY=
MERCADO_PAGO_WEBHOOK_SECRET=    # "assinatura secreta" do webhook no painel MP
MERCADO_PAGO_ENVIRONMENT=sandbox   # ou production
```
Ausência = billing desabilitado (checkout 500, webhook 200-ack) — não quebra o boot.

## 5. Configuração manual no painel do Mercado Pago
1. **Suas integrações → Criar aplicação** (produto: Assinaturas/CheckoutPro).
2. **Credenciais** (teste e produção) → `ACCESS_TOKEN` + `PUBLIC_KEY`.
3. **Contas de teste** → criar um usuário **comprador** (sandbox exige pagador que seja test user).
4. **Webhooks** → URL `https://archflow-backend-production.up.railway.app/api/webhooks/mercadopago`; eventos: **Pagamentos** + **Assinaturas/Preapproval**; copiar a **assinatura secreta** → `WEBHOOK_SECRET`.
5. (Opcional) criar **preapproval plans** mensal/anual por tier e preencher `BillingPlan.mpPreapprovalPlanId*` — hoje usamos preapproval dinâmico (funciona sem isso).

## 6. Verificação
- `tsc` limpo nos 2 repos.
- Backend vitest: **353 testes, 346 pass / 7 fail** (as 7 são pré-existentes: proposal/provision/workspace — sem relação com billing). Novos: 22.
- Frontend: `npm run build` ok · vitest 64/64.
- **Sandbox ao vivo:** `createSubscription` → 201 + `init_point`; `getSubscription` → 200; verificação HMAC (secret real) aceita válida / rejeita adulterada.

## 7. Melhorias recomendadas (próxima sprint)
- **Job de reconciliação (cron):** downgrade em period-end para cancelamentos agendados, `PAST_DUE → EXPIRED` após N tentativas, e sync de status contra webhooks perdidos. Hoje a expiração de trial é lazy-on-read e o period-end depende de webhook.
- **Email "fim do trial" (lembrete):** template e método já existem (`sendTrialEnding`); falta o gatilho — o cron acima é o lugar natural.
- **Processamento de webhook por fila** (Vercel Queues/BullMQ) quando o volume exigir — hoje é inline idempotente com fast-ack + retry via 500.
- **Consolidar configs de plano:** `BillingPlan` já é canônico de exibição; migrar o `config/pricing.ts` legado do frontend e a landing para lê-lo encerra as 3 fontes.
- **Método de pagamento no portal:** estrutura pronta; expor troca de cartão via MP.
