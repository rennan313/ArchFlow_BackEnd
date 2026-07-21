# Vincel Studio — Performance Guide

**Status**: Release 1.0 (Finance Foundation), 2026-07-15
**Escopo**: quando usar (e quando NÃO usar) desnormalização, índices, materialized views, caching, CQRS e eventos — com números reais medidos no módulo Financeiro, não estimativas.

**Princípio central, acima de qualquer técnica específica**: **meça antes de otimizar**. Toda decisão de performance neste documento nasceu de uma medição contra dados sintéticos em volume realista, não de intuição sobre "isso provavelmente é lento". Otimizar sem medir tem dois custos: risco de otimizar onde não importa, e risco de deixar de otimizar onde importa muito (o caso `projectId`, abaixo, era invisível até alguém rodar a query contra 100 mil linhas).

---

## 1. Desnormalização

**O que é**: copiar um campo de uma coleção relacionada para a coleção que você lê no caminho quente, trocando um `$lookup` em tempo de leitura por uma cópia mantida em tempo de escrita.

**Quando usar** — as duas condições precisam ser verdadeiras **simultaneamente**:
1. O campo de origem é **imutável** depois que o documento pai é criado (nenhum caminho de código pode editá-lo depois).
2. O documento que carrega a cópia é **append-only** (nunca editado depois de escrito).

Se as duas condições valem, a cópia nunca pode divergir do original — não precisa de mecanismo de sincronização, só de escrevê-la corretamente uma vez, na criação.

**Casos reais**:

| Campo denormalizado | De → Para | Medição que justificou | Índice resultante |
|---|---|---|---|
| `Payment.direction` (RC-2.5) | `FinancialDocument.direction` | Eliminou `$lookup` de 2 saltos nas 11 agregações do dashboard | `[workspaceId, direction, paidAt]` |
| `Payment.projectId` (RC-3.3) | `FinancialDocument.projectId` | **30.337ms → 140ms** a 100k pagamentos (225x) só isolando a query; **459ms** medido de ponta a ponta a 300k pagamentos com o campo real | `[workspaceId, projectId, direction]` |

**Quando NÃO usar**:
- O campo de origem pode ser editado depois da criação (ex.: nome de um Fornecedor, categoria de um documento antes de cancelado) — denormalizar aqui introduz divergência silenciosa. Se o dado precisa estar disponível sem `$lookup`, a resposta é um **rollup ativamente mantido** (§3), não uma cópia estática.
- O caminho de leitura não é medido como lento — denormalizar preventivamente duplica dado que ninguém provou que precisa, aumentando superfície de manutenção (todo campo denormalizado é uma prova a manter válida para sempre) sem ganho comprovado.
- O volume de dados é pequeno o suficiente que um `$lookup` nunca vai doer (ex.: uma tabela de configuração com dezenas de linhas por workspace) — meça primeiro; se a resposta é "menos de 10ms mesmo em volume alto", não denormalize.

**Processo obrigatório antes de denormalizar** (ADR-011, também em `ENGINEERING_STANDARDS.md` §7):
1. Seed sintético em volume realista, medir a query atual.
2. `explain()` para confirmar se falta índice é a causa raiz (às vezes um índice resolve sem precisar denormalizar nada — ver §2).
3. Confirmar as duas condições de segurança acima.
4. Implementar, medir de novo, documentar os dois números (antes/depois) — não só "ficou mais rápido".

---

## 2. Índices

**Regra**: todo índice composto usado por uma query de domínio começa com `workspaceId` (toda query financeira, e por extensão toda query de qualquer módulo futuro, filtra por workspace primeiro — ADR-006). A ordem dos campos no índice deve espelhar a ordem em que a query filtra/ordena.

**Quando um índice sozinho resolve** (sem precisar denormalizar): quando a query já filtra por campos que existem na MESMA coleção — o problema é só a ausência de um índice cobrindo esses campos juntos. Exemplo: `financialDashboardService`'s 11 agregações passaram a usar `IXSCAN` diretamente assim que os campos certos (`workspaceId, direction, paidAt`) tinham um índice composto — sem precisar denormalizar nada além do que a RC-2.5 já tinha feito.

**Quando um índice NÃO resolve**: quando a query precisa filtrar por um campo que só existe numa coleção *relacionada* (o caso `projectId` antes da RC-3.3) — nenhum índice na coleção local ajuda um `$lookup` a não ser um $lookup; a resposta aí é desnormalizar (§1) ou aceitar o custo do lookup se for raro/não-crítico.

**Antes de adicionar qualquer índice**: confirmar com `explain({ verbosity: "queryPlanner" })` que a query realmente usa esse índice (`IXSCAN` no plano vencedor), não assumir. Um índice não usado pela query real é custo de escrita (todo índice torna inserts/updates mais lentos) sem benefício de leitura.

---

## 3. Materialized Views (rollups)

**O que é**: uma coleção separada, pré-computada, atualizada incrementalmente a cada escrita relevante (ou por job periódico), que a leitura consulta em vez de agregar em tempo real.

**Status atual**: **não implementado em nenhum lugar do Vincel Studio** — decisão deliberada da RC-2/RC-3, não uma lacuna esquecida. As 11 agregações do dashboard e o resumo por projeto continuam calculando em tempo real a cada leitura.

**Quando usar** (gatilho documentado, não implementado preventivamente):
- Quando o volume de `Payment`/`Installment` **por workspace individual** (não a soma entre todos os tenants — cada query já é `workspaceId`-scoped, então o que importa é o pior caso de um único workspace) começar a ultrapassar a ordem de dezenas de milhares de linhas, **e**
- Quando o tempo de resposta medido do dashboard/resumo exceder o orçamento de latência aceitável para aquela tela (hoje: dashboard ~940ms a 300k pagamentos — ainda aceitável; o gatilho é quando isso passar de ~2s, ou antes, se o produto definir um orçamento explícito).

**Como migrar quando o gatilho disparar** (desenho já registrado, não implementado):
1. Coleção `financial_summaries` (ou por período: `financial_summaries_monthly`), chave `[workspaceId, yearMonth]` ou `[workspaceId, projectId, yearMonth]`.
2. Atualizar incrementalmente dentro da mesma transação de `registerPayment`/`createWithInstallments` (ADR-003 já garante atomicidade — o rollup entra como mais uma escrita na mesma transação), ou assincronamente via o sistema de `Automation`/`AutomationRun` já existente (reage a eventos de domínio, lugar natural para pendurar isso).
3. Os services de agregação atuais (`financialDashboardService`, `projectFinancialSummaryService`) passam a ler do rollup — a REGRA de cálculo continua no backend (ADR-009), só a fonte de leitura muda.
4. Manter a agregação em tempo real como fallback/reconciliação (job periódico que recalcula e compara) antes de confiar cegamente no rollup — nunca descartar a via de verdade original de imediato.

**Quando NÃO usar**: antes do gatilho acima. Um rollup mantido incrementalmente é uma segunda fonte de verdade que pode divergir da primeira (ao contrário da desnormalização do §1, que é matematicamente incapaz de divergir dado as duas condições) — todo rollup precisa de reconciliação periódica, que é complexidade operacional real. Não pague esse custo até medir que precisa.

---

## 4. Caching

**Status atual**: não usado no módulo Financeiro. Não há Redis/cache de aplicação no backend hoje.

**Quando considerar**: dado de leitura frequente, escrita rara, tolerante a alguma janela de staleness — candidatos naturais seriam tabelas de referência quase-estáticas (`FinancialCategory`, `CostCenter`, `SupplierCategory` — mudam raramente, lidas em todo formulário de lançamento). Não é o caso do dashboard/resumo financeiro, que precisa refletir pagamentos recém-registrados imediatamente (staleness de cache aqui seria um bug percebido pelo usuário: "acabei de pagar e o saldo não atualizou").

**Quando NÃO usar**: qualquer leitura que precisa refletir uma escrita financeira recente sem atraso perceptível — dashboard, saldo de conta bancária, resumo de parcela. Cache aqui trocaria um problema de performance mensurável por um problema de correção percebida, que é pior.

---

## 5. CQRS (Command Query Responsibility Segregation)

**Status atual**: não implementado formalmente — mas o princípio "Dashboard consome Analytics, nunca contém regra de negócio" (ADR-009) já é uma separação parcial de leitura/escrita: os services de agregação (`financialDashboardService`, `projectFinancialSummaryService`) são efetivamente o lado de "Query" de um CQRS informal, já isolados dos services de escrita (`installmentService`, `financialDocumentService`).

**Quando formalizar como CQRS de verdade** (modelos de leitura e escrita fisicamente separados, não só logicamente): quando o §3 (materialized views) for implementado — nesse ponto, o lado de leitura passa a consultar uma coleção diferente da que o lado de escrita grava, que é exatamente a definição de CQRS. Não vale a pena nomear/formalizar antes disso — seria rótulo sem mudança de arquitetura real.

**Quando NÃO usar**: enquanto leitura e escrita compartilham a mesma fonte de dados (estado atual), chamar isso de CQRS só adiciona vocabulário sem separação real. Reserve o termo (e a complexidade que ele sinaliza) para quando o rollup do §3 existir de fato.

---

## 6. Eventos (para performance, não só para auditoria)

Ver `DOMAIN_GUIDE.md` §4 para o papel de eventos como registro de domínio. Do ponto de vista de performance especificamente: eventos (via `Automation`/`AutomationRun`) são o mecanismo natural para popular um rollup materializado de forma assíncrona (§3) sem acoplar a latência da escrita original ao cálculo do rollup — se o rollup for atualizado dentro da mesma transação da escrita original, toda escrita financeira paga o custo de manter o rollup; se for via evento assíncrono, a escrita original permanece rápida e o rollup converge com um atraso pequeno e aceitável.

**Trade-off a decidir explicitamente quando o rollup for implementado**: rollup síncrono (dentro da transação — nunca fica desatualizado, mas todo `registerPayment` fica um pouco mais lento) vs. assíncrono via evento (mais rápido no caminho de escrita, mas o rollup pode ficar momentaneamente desatualizado até o evento processar). Não há resposta universal — depende de quão crítico é "o dashboard nunca pode estar um segundo atrasado" para o produto.

---

## Armadilhas operacionais (aprendidas na prática, não teóricas)

Duas lições encontradas rodando scripts de medição de performance contra dados sintéticos em volume real, que vão se repetir para qualquer módulo futuro que precise do mesmo tipo de teste:

1. **`$runCommandRaw` com `delete`/`deleteMany` pode ter um teto silencioso de quantos documentos remove por chamada**, mesmo com `limit: 0` — uma única chamada contra um match set de centenas de milhares de documentos pode reportar sucesso tendo removido só uma fração, deixando o resto órfão. Qualquer limpeza em massa (scripts de teste, migrations) deve rodar em loop até uma chamada reportar zero documentos removidos.
2. **Debug logging do Prisma (`prisma:query`) em um processo Node com stdout redirecionado para arquivo/pipe em background pode bufferizar indefinidamente**, consumindo memória sem limite visível e nunca liberando o buffer — um script de seed que parecia "travado" com 4.5GB de heap era na verdade esse buffer, não um vazamento de memória do código de aplicação. Scripts de medição devem logar via `fs.appendFileSync` (escrita síncrona, imediata) em vez de depender de `console.log` capturado por um processo pai.
