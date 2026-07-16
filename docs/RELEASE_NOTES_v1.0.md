# ArchFlow — Financial Foundation, Release 1.0

**Data**: 2026-07-15
**Escopo**: módulo Financeiro (AP/AR do escritório) — MVP → RC-1 (auditoria) → RC-2 (correções críticas) → RC-3 (zero dívida crítica) → esta Release (congelamento arquitetural).

> **Nota de escopo**: este documento cobre exclusivamente o módulo Financeiro do backend (`ArchFlow_BackEnd`). Para as release notes do produto ArchFlow como um todo (autenticação, CRM, propostas, projetos — lançado em 2026-07-09), ver `ArchFlow/RELEASE_NOTES_v1.0.md` no repositório do frontend — são dois documentos distintos, este não o substitui nem o atualiza.

---

## Principais funcionalidades

- **Fornecedores** — cadastro com categorias configuráveis por workspace, vínculo derivado a projetos (via histórico de lançamentos, sem tabela de junção própria).
- **Contas Bancárias** — saldo sempre derivado (saldo inicial + líquido de pagamentos), nunca armazenado, para nunca divergir do ledger real.
- **Lançamentos Financeiros unificados** (`FinancialDocument`) — um único modelo para contas a pagar e a receber, distinguidos por `direction`, seguindo o padrão Título → Parcela → Baixa (parcelamento flexível de 1 a 360 parcelas, pagamentos parciais/múltiplos por parcela).
- **Categorias Financeiras hierárquicas** (plano de contas em árvore, direção fixa por galho) e **Centros de Custo**.
- **Dashboard financeiro** — receita/despesa prevista e realizada, saldo, contas vencidas e a vencer, sem gráficos nesta versão.
- **Resumo financeiro por projeto** — receita/despesa, saldo, margem direta (contratada, sem rateio de indiretos), fornecedores vinculados.
- **Permissões granulares** — visibilidade de dados financeiros restrita por papel (`view:financial-*`), diferente do padrão de leitura universal do resto do produto.

## Arquitetura

Documentada formalmente em `FINANCIAL_ARCHITECTURE_DECISIONS.md` (11 ADRs congelados) e `DOMAIN_GUIDE.md`. Pilares:
- Dinheiro sempre `BigInt` em centavos, nunca `Float`/`Number`, através de uma Money Library centralizada (`src/lib/money/`).
- Todo pagamento é idempotente por chave gerada no cliente + índice único no banco — não por checagem de aplicação.
- Toda escrita multi-coleção é transacional com retry automático sob conflito de escrita (`withTransactionRetry`).
- Datas de competência/vencimento/pagamento tratadas como Date-Only (sempre UTC, nunca timezone do servidor); limites de mês do dashboard usam um timezone de negócio fixo (Brasil, UTC-3).
- `workspaceId` obrigatório em toda query, todo índice, toda agregação — sem exceção.
- Nenhuma entidade financeira suporta exclusão física — soft-cancel/arquivamento sempre, com bloqueio de exclusão a montante (Projeto/Cliente) quando há histórico vinculado.

## Melhorias (histórico das sprints)

- **RC-1** — auditoria completa pré-produção: arquitetura, segurança (IDOR, cross-tenant, permissões), correção financeira, qualidade de backend/frontend, performance de dashboard, teste de stress conceitual.
- **RC-2** — eliminação de todos os riscos críticos encontrados na RC-1: idempotência de pagamentos, migração para `BigInt`, exclusão segura, integridade transacional com retry, denormalização inicial (`Payment.direction`) para performance de dashboard, biblioteca de dinheiro centralizada, correção de timezone, expansão de testes, logging de auditoria inicial.
- **RC-3** — fechamento da race condition residual entre cancelamento e pagamento (compare-and-set), denormalização de `Payment.projectId` (gargalo medido de 30s a 100k pagamentos, corrigido para ~460ms a 300k), observabilidade (métricas em processo, `correlationId`+`event` em todo log de auditoria), revisão de consistência de todo o domínio financeiro, testes de concorrência e stress real contra MongoDB (até 500 usuários simultâneos simulados).
- **Esta Release** — congelamento arquitetural: toda decisão formalizada em ADR, guias de engenharia/performance/domínio criados, revisão de consistência estendida ao resto do backend (não só o Financeiro).

## Performance

Medido, não estimado (ver `PERFORMANCE_GUIDE.md` para o processo completo):
- Resumo financeiro por projeto: **~460ms a 300 mil pagamentos** no workspace (era ~30 segundos a apenas 100 mil, antes da correção de denormalização da RC-3.3 — 65x mais dados, mais rápido em termos absolutos).
- Dashboard financeiro (11 agregações paralelas): ~514ms a 100k pagamentos, ~940ms a 300k — dentro de orçamento aceitável, uso de índice confirmado via `explain()`.
- Nenhuma materialized view implementada nesta Release — gatilho de quando implementar está documentado (`PERFORMANCE_GUIDE.md` §3), não acionado ainda pelos volumes reais de produção.

## Segurança

- RBAC granular por verbo:recurso, hierarquia de papéis (`OWNER > ADMIN > ARCHITECT/DESIGNER > ASSISTANT > VIEWER`).
- Defesa em profundidade: toda query de repository escopa por `workspaceId` explicitamente, independentemente do que a camada de rota já validou.
- Nenhum log de auditoria financeiro contém segredos, tokens, ou números de conta — apenas IDs internos e valores monetários formatados.
- Cross-tenant: chave de idempotência validada contra o workspace de origem antes de retornar um pagamento existente (defesa contra reuso improvável, mas não assumido impossível, de uma chave de outro tenant).

## Escalabilidade

Verificado sob concorrência real (não mockada) contra MongoDB:
- 500 usuários simultâneos registrando pagamentos distintos: 100% de sucesso, zero erros.
- 500 usuários disputando a mesma parcela: exatamente 1 pagamento criado, nunca overpay, nunca duplicata.
- 500 usuários reenviando o mesmo pagamento (mesma chave de idempotência): exatamente 1 linha no banco, todos os chamadores recebem o mesmo resultado de volta.
- 45 execuções de cancelamento vs. registro de pagamento disputando o mesmo documento: zero anomalias.

## Breaking Changes

Nenhuma mudança de contrato de API nesta Release (RC-3 → Release 1.0 é documentação e congelamento, não código). Mudanças de schema acumuladas desde o MVP (histórico, para quem consome a API diretamente):
- Campos monetários migraram de `Int` (BSON Int32) para `BigInt` (BSON Int64) — serializados como **string numérica** em JSON, não `number`, desde a RC-2.2. Qualquer consumidor de API que espera `number` em campos `*Cents` precisa fazer `Number(valor)` ou usar aritmética de `bigint` diretamente.
- `Payment` exige `idempotencyKey` (UUID) em toda requisição de criação desde a RC-2.1 — requisições sem esse campo são rejeitadas por validação Zod.

## Limitações conhecidas

- Sem materialized views/rollup — leitura agregada sempre em tempo real (aceitável nos volumes medidos, ver Performance acima).
- Sem reversão de pagamento (estorno) — `Payment` é append-only por design; correção de um pagamento errado hoje exige um lançamento manual compensatório, não uma function de "desfazer".
- Sem rateio de despesas indiretas na margem por projeto — "margem direta" é deliberadamente contratado menos previsto, sem alocação de custo fixo/overhead.
- Sem conciliação bancária automática (OFX/Open Finance), sem emissão de NF-e, sem boleto/PIX automatizado — todos fora de escopo desde o MVP original, endereçados no roadmap (`ARCHITECTURE_ROADMAP.md` §7).
- `withTransactionRetry` (o mecanismo de retry sob conflito transacional) é usado só pelo módulo Financeiro — outras escritas multi-coleção do app (ex.: mudança de plano de assinatura disparada por webhook de pagamento real) ainda não têm a mesma proteção; documentado como achado de prioridade alta no Anexo de `FINANCIAL_ARCHITECTURE_DECISIONS.md`.
- Billing (assinatura SaaS do próprio ArchFlow) ainda usa `Float` para valores monetários, não `BigInt`/centavos — tensão não resolvida com o ADR-001, documentada como dívida técnica de prioridade baixa.

## Próximos passos

Ver `ARCHITECTURE_ROADMAP.md` para o desenho técnico completo de cada item:
1. **Compras** — próximo módulo, maior reaproveitamento direto da fundação financeira.
2. Fechar os achados de prioridade alta/média do Anexo de `FINANCIAL_ARCHITECTURE_DECISIONS.md` (retry em `subscription.service.ts`, guards de exclusão em Oportunidade/Proposta, padrão único de logging para o app inteiro) — recomendado antes ou em paralelo ao início de Compras, não depois.
3. Analytics (rollup materializado) — quando o gatilho de volume documentado em `PERFORMANCE_GUIDE.md` §3 disparar, não antes.
