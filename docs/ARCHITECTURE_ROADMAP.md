# Vincel Studio — Architecture Roadmap

**Status**: Release 1.0 (Finance Foundation), 2026-07-15
**Escopo**: evolução arquitetural proposta para os próximos bounded contexts do Vincel Studio, cada um justificado tecnicamente a partir da fundação congelada em `FINANCIAL_ARCHITECTURE_DECISIONS.md` e `DOMAIN_GUIDE.md`. Ordem de apresentação não é necessariamente ordem de prioridade de produto — é ordem de dependência técnica (cada módulo é descrito depois dos módulos dos quais ele depende).

---

## 1. Compras

**Status**: Fase 1 (Fundação) implementada em 2026-07-16 — ver `COMPRAS_ARCHITECTURE_DECISIONS.md`. Escopo entregue: `PurchaseOrder` único (sem `Quotation` separado — `status: DRAFT` cobre a fase de cotação), um fornecedor por pedido, itens em texto livre (sem catálogo reutilizável), aprovação gera `FinancialDocument` atomicamente, sem cancelamento de pedido já `APPROVED`. Deliberadamente fora desta fase, YAGNI até haver demanda real:

- Entidade `Quotation` separada para comparar múltiplos fornecedores lado a lado no mesmo fluxo (hoje: criar um `PurchaseOrder` DRAFT por fornecedor e cancelar os não escolhidos).
- Catálogo de Item/Material reutilizável entre pedidos.
- Cancelamento de um `PurchaseOrder` já `APPROVED` (exigiria coordenar com o cancelamento do `FinancialDocument` gerado, que tem sua própria regra de bloqueio por pagamento).

**O que é**: pedidos de compra e cotações do escritório junto a fornecedores — o próximo passo natural depois do Financeiro, e o motivo declarado desta Release ser um congelamento antes de começar.

**Dependências**: `Supplier`/`SupplierCategory` (Financeiro, já existem e já são configuráveis por workspace). Gera `FinancialDocument` (`direction: PAYABLE`) quando um pedido é aprovado.

**Desenho proposto**:
- `PurchaseOrder`/`Quotation` como bounded context próprio, com seus próprios `Item`s (não reaproveitar `Installment` — um pedido de compra tem itens de material/serviço, não parcelas de pagamento).
- Ao aprovar um `PurchaseOrder`, uma automação (padrão `AutomationKey`/`AutomationRun` já existente — mesmo mecanismo que `AUTO_CREATE_PROJECT_ON_APPROVED` usa para Oportunidade→Projeto) cria um `FinancialDocument` correspondente. **Compras depende de Financeiro; Financeiro nunca depende de Compras** (regra de dependência unidirecional, `DOMAIN_GUIDE.md` §6) — o `FinancialDocument` resultante não carrega uma referência de volta para o `PurchaseOrder` na direção que criaria acoplamento circular; se rastreabilidade for necessária, o `PurchaseOrder` guarda o `financialDocumentId` gerado, não o inverso.
- Todo valor monetário em `PurchaseOrder`/`Item` é `BigInt` em centavos desde o primeiro schema (ADR-001) — não há desculpa de "é só uma cotação, não é dinheiro real ainda" para usar Float; o padrão vale desde o rascunho.

**Justificativa técnica**: é o módulo com o maior reaproveitamento direto da fundação — `Supplier`, `withTransactionRetry`, `AppError`/`ErrorCode`, o padrão de RBAC granular (`view:purchase-orders` espelhando `view:financial-documents`), e o padrão de guard de exclusão física (um `PurchaseOrder` aprovado que já gerou `FinancialDocument` nunca pode ser excluído fisicamente, mesmo raciocínio do ADR-008). Nenhuma infraestrutura nova é necessária além de novos modelos de schema e um novo módulo seguindo a estrutura de `ENGINEERING_STANDARDS.md` §1.

**Risco a evitar**: replicar a race condition do ADR-004 na nova fronteira `PurchaseOrder`↔`FinancialDocument` — se um `PurchaseOrder` puder ser cancelado concorrentemente com a geração do `FinancialDocument` que ele dispara, aplicar o mesmo padrão de compare-and-set desde o design, não como correção posterior.

---

## 2. Analytics

**O que é**: formalização do rollup materializado já desenhado (mas não implementado) em `PERFORMANCE_GUIDE.md` §3 — quando o volume de dados por workspace justificar, não antes.

**Dependências**: consome os services de agregação existentes (`financialDashboardService`, `projectFinancialSummaryService`) como sua camada de domínio — não os reescreve (ADR-009).

**Desenho proposto**: coleção `financial_summaries` (chave `[workspaceId, yearMonth]`), atualizada incrementalmente via o mecanismo de `Automation` já existente, servindo tanto o dashboard atual quanto relatórios futuros mais amplos (fluxo de caixa projetado, comparação ano-a-ano). Analytics não é um bounded context de dados próprios — é uma camada de leitura sobre os bounded contexts existentes (Financeiro primeiro, depois potencialmente Compras/Obras conforme esses módulos amadurecerem).

**Justificativa técnica**: o gatilho de implementação já está documentado numericamente (`PERFORMANCE_GUIDE.md` §3) — implementar antes do gatilho é otimização prematura; adiar depois do gatilho é o mesmo erro que o `projectId` cometeu antes da RC-3.3 (um problema real, não medido, virando incidente de produção). O papel deste item no roadmap é "o gatilho existe, está escrito, será acionado quando os números baterem" — não "construir agora".

**Risco a evitar**: uma vez que Analytics existir como rollup, é tentador deixar regra de negócio nova vazar para dentro dele (ex.: uma métrica nova calculada só na camada de rollup, nunca no service de domínio original) — viola ADR-009 da mesma forma que calcular no frontend violaria. Toda métrica nasce no service de domínio; o rollup só é uma cópia otimizada de algo que o domínio já sabe calcular.

---

## 3. Portal do Cliente

**O que é**: uma superfície voltada para fora do workspace — o cliente do escritório (não um membro da equipe) acessando o status do próprio projeto, proposta e, potencialmente, suas próprias parcelas a pagar.

**Dependências**: `Client`, `Project`, `Proposal` (leitura), `FinancialDocument`/`Installment` filtrados por `direction: RECEIVABLE` e `clientId` (leitura restrita — nunca visibilidade de despesas do escritório, margem, ou fornecedores).

**Desenho proposto — a mudança arquitetural mais significativa deste roadmap**: hoje, `workspaceId` é a única fronteira de tenant (ADR-006, "sem exceção"). Um Portal do Cliente introduz uma **segunda dimensão de escopo dentro do mesmo workspace** — um cliente autenticado só pode ver dados filtrados por `clientId` DENTRO do workspace, nunca outros clientes do mesmo escritório. Isso não invalida o ADR-006 (workspace continua sendo a fronteira externa), mas exige uma camada adicional de escopo que hoje não existe em nenhum repository — cada query no caminho do Portal precisa de `workspaceId` **e** `clientId`, e a sessão de um cliente do portal precisa ser estruturalmente distinta de uma sessão de membro do workspace (não pode ter `workspaceRole`, porque não é um papel de equipe).

**Justificativa técnica**: reaproveita RBAC (`src/middlewares/rbac.ts`) como precedente conceitual, mas precisa de um novo tipo de sessão (não `WorkspaceRole`, algo como uma sessão de "Client Portal" com seu próprio JWT/claims) — proposto como extensão do sistema de auth existente, não substituição. É o primeiro módulo do roadmap que introduz um consumidor externo autenticado (não um membro do escritório), então é também o primeiro a precisar de rate limiting e superfície de ataque considerados sob um modelo de ameaça diferente (o "atacante" agora inclui qualquer cliente tentando ver dados de outro cliente do mesmo escritório).

**Risco a evitar**: vazar `view:financial-dashboard`-style de dados agregados (margem, custo pago a fornecedor) para o portal — o portal deve expor um subconjunto deliberadamente estreito (parcelas do próprio cliente, status do próprio projeto), nunca reaproveitar um endpoint interno "porque já existe e já filtra por workspace" sem auditar explicitamente se ele também filtra por `clientId` e esconde campos sensíveis.

---

## 4. Centro de Inteligência

**O que é**: camada de insights/recomendações (ex.: previsão de fluxo de caixa, alerta de inadimplência provável, sugestão de categorização automática) — construída sobre Analytics (§2), não sobre dados brutos.

**Dependências**: Analytics (§2) como fonte de leitura; o módulo de IA já existente (`src/services/ai/`, hoje usado para geração de propostas) como precedente de integração com Claude.

**Justificativa técnica**: `DOMAIN_GUIDE.md` §4 já estabelece que eventos que **disparam** efeitos usam o padrão de Automação — um "Centro de Inteligência" que gera alertas é, estruturalmente, um consumidor de eventos de domínio (pagamento registrado, parcela vencida, documento cancelado) processando-os para produzir uma recomendação, não uma nova fonte de verdade financeira. Ele **lê** do Financeiro/Analytics e **nunca escreve** de volta no ledger diretamente — qualquer ação sugerida por IA que o usuário aceite (ex.: "categorizar automaticamente") passa pelos mesmos services/repositories/validações que uma ação manual, nunca um caminho de escrita paralelo "porque é a IA fazendo".

**Risco a evitar**: dar à IA um caminho de escrita direto ao banco que pule idempotência (ADR-002) ou os guards de exclusão (ADR-008) "porque é automatizado, não um usuário clicando" — automação não é exceção às garantias, é mais um chamador dos mesmos services.

---

## 5. Obras

**O que é**: acompanhamento de execução física do projeto (visitas a obra, progresso, consumo de material) — bounded context novo, paralelo a Projetos, mas com seu próprio ciclo de vida (uma obra pode ter fases que `ProjectPhase` hoje não captura em granularidade de campo).

**Dependências**: `Project` (todo registro de obra pertence a um projeto), `Compras` (§1, materiais consumidos numa visita de obra podem referenciar itens de um `PurchaseOrder`), potencialmente `FinancialDocument` (despesas de obra registradas em campo).

**Justificativa técnica**: é o primeiro módulo do roadmap com um caso de uso plausivelmente **mobile-first** (equipe de campo registrando progresso, não alguém no escritório) — o que antecipa a necessidade descrita em §6 (App Mobile) antes de qualquer outro módulo. Arquiteturalmente, deve seguir o mesmo padrão de dependência unidirecional: Obras depende de Projetos e Compras/Financeiro para leitura de contexto, mas nem Projetos nem Financeiro devem saber que Obras existe.

**Risco a evitar**: um app de campo com conectividade instável tenta empurrar developers para escrita otimista sem confirmação — qualquer escrita financeira originada de Obras (uma despesa de campo) precisa passar pelo mesmo caminho idempotente (ADR-002) que qualquer outra escrita financeira, com a chave de idempotência gerada no momento da ação em campo (mesmo se a sincronização com o servidor só acontecer minutos depois, quando a conectividade voltar) — nunca gerar a chave só no momento do envio HTTP, ou um reenvio automático depois de reconexão perde a proteção.

---

## 6. Aplicativo Mobile

**O que é**: não é um bounded context novo — é um novo consumidor das APIs existentes, com implicações de arquitetura de API, não de domínio.

**Dependências**: toda API REST já exposta (`src/app/api/**`); o ciclo de vida de token já documentado (`TOKEN_LIFECYCLE.md`, frontend) como precedente de autenticação renovável.

**Justificativa técnica**: como as rotas de API já são Next.js route handlers desacoplados do frontend web (consumidas hoje por Server Components/Server Actions, mas são HTTP puro por baixo), um cliente mobile é "só mais um consumidor HTTP" — nenhuma mudança de arquitetura de domínio é necessária para o Financeiro ou qualquer módulo existente. O trabalho real de arquitetura está em: (1) considerações de payload para conexões mais lentas/instáveis (paginação já existe via `buildMeta`, mas endpoints de agregação pesada como o dashboard podem precisar de uma versão "resumida" para mobile), e (2) o caso de uso de Obras (§5) sendo o principal motivador real de um app mobile, não o Financeiro em si — um usuário raramente registra um pagamento pelo celular, mas frequentemente registra progresso de obra em campo.

**Risco a evitar**: tratar "suporte a mobile" como justificativa para relaxar qualquer garantia de segurança/idempotência já estabelecida "porque o app mobile é diferente" — as mesmas regras (ADR-002 a ADR-011) valem para toda origem de requisição, web ou mobile.

---

## 7. Integrações

**O que é**: os itens explicitamente adiados do escopo original do MVP financeiro — OFX/Open Finance (conciliação bancária automática), NF-e (nota fiscal eletrônica), boletos/PIX automáticos, integração contábil.

**Dependências**: `BankAccount`/`Payment` (Financeiro) para conciliação; `FinancialDocument` para geração de NF-e a partir de um lançamento `RECEIVABLE`.

**Justificativa técnica**: cada integração externa é, estruturalmente, um novo `provider` seguindo o precedente já estabelecido por `src/modules/billing/providers/` (abstração de gateway, hoje usada para Mercado Pago) — a interface de um provider de conciliação bancária ou emissão de NF-e deveria seguir o mesmo contrato de abstração (`createXxx`, sem acoplar o resto do código a um SDK específico), pela mesma razão que billing já faz isso: trocar de provedor no futuro (ou suportar múltiplos) não deve exigir reescrever quem chama o provider.

**Ordem de prioridade sugerida** (técnica, não de produto): conciliação bancária (OFX/Open Finance) antes de NF-e — conciliação é leitura+matching contra dados que já existem (`Payment`), enquanto NF-e é geração de um documento fiscal com requisitos legais/de compliance que aumentam a superfície de risco de forma desproporcional ao valor entregue numa primeira iteração.

**Risco a evitar**: uma integração de conciliação bancária que tenta "corrigir" automaticamente um `Payment` já existente (editá-lo para bater com o extrato) viola o design append-only do ADR-008 — o padrão correto é sempre um registro complementar (ex.: um `BankReconciliationMatch` referenciando o `Payment` e a linha de extrato), nunca uma edição do `Payment` original.

---

## 8. IA

**O que é**: extensão do uso de IA já existente (`src/services/ai/`, geração assistida de propostas via Claude) para o domínio financeiro — categorização automática de despesas, detecção de anomalias em pagamentos, projeção de fluxo de caixa.

**Dependências**: Analytics (§2) e Centro de Inteligência (§4) como camada intermediária — IA no Financeiro não deveria ler direto do ledger transacional se uma camada de agregação já existir para o mesmo propósito.

**Justificativa técnica**: o precedente de `ProposalAdvisorService` (`src/services/ai/proposal-advisor*.ts`) já estabelece o padrão correto: a IA **recomenda**, o usuário **confirma**, a escrita real passa pelos services de domínio normais — nunca a IA escrevendo diretamente numa coleção. Esse mesmo padrão vale para Financeiro: uma sugestão de categorização de despesa gerada por IA nunca deveria escrever `FinancialCategory` numa transação sem o usuário confirmar, pela mesma razão que a IA não gera e publica uma proposta sozinha hoje.

**Risco a evitar**: dar à IA acesso a informação sensível de forma mais ampla do que RBAC permitiria a um humano no mesmo papel — se `ASSISTANT` não pode ver `view:financial-dashboard` (ADR-007), uma feature de IA rodando "em nome" de um usuário `ASSISTANT` não deveria ter acesso a esses dados agregados só porque é a IA fazendo a leitura, não a pessoa diretamente.
