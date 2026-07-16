# ArchFlow — Module Creation Checklist

**Status**: VIGENTE — Sprint 1 (Platform Freeze 2.0), 2026-07-15
**Escopo**: as 14 perguntas que todo módulo novo responde **por escrito** antes de ser considerado concluído. Não é burocracia decorativa — cada pergunta existe porque a ausência da resposta correspondente virou um risco crítico real em alguma sprint do Financeiro (a referência entre parênteses aponta o incidente/decisão de origem).

**Como usar**: copiar a tabela abaixo para o documento de design do módulo (ou o PR de conclusão), responder cada linha com um link/citação concreta — "sim" sem apontar onde não conta como resposta. Um módulo com qualquer linha em aberto não passa pelo Definition of Done (`DEFINITION_OF_DONE.md`).

---

## O Checklist

### 1. Existe Aggregate?
Quais são as raízes de aggregate do módulo, e quais invariantes cada uma garante? Escreva os invariantes como frases verificáveis ("a soma dos pagamentos de uma parcela nunca excede o valor da parcela"), não como intenções vagas. Se duas operações independentes podem competir em torno do mesmo aggregate, qual é o mecanismo de serialização (compare-and-set no documento compartilhado — ADR-004)?
*Origem: RC-3.1 — a race cancelamento×pagamento existiu porque duas operações tocavam o mesmo aggregate por coleções diferentes.*

### 2. Existe Repository?
Todo acesso ao Prisma passa por `src/repositories/*.repository.ts` (nunca dentro do módulo — `ENGINEERING_STANDARDS.md` §1)? Nenhum service chama `prisma` diretamente (exceção documentada: services de agregação Analytics, ADR-009)?

### 3. Existe Service?
Services seguem a forma padrão (`ENGINEERING_STANDARDS.md` §2): `workspaceId` explícito em toda função pública, `getById` lança `*_NOT_FOUND`, erros sempre via `AppError(ErrorCode.X)`, barrel de módulo como único ponto de import externo?

### 4. Existe ADR?
As decisões estruturais do módulo (schema, padrões novos, exceções a ADRs existentes) estão registradas em `<MODULO>_ARCHITECTURE_DECISIONS.md` no formato padrão, ANTES do código que as implementa (`ARCHITECTURE_GOVERNANCE.md` §1)?

### 5. Existe documentação?
`DOMAIN_GUIDE.md` atualizado com o bounded context novo (aggregates, relacionamentos, direção de dependência)? `CORE_MODULE_POLICY.md` atualizado se o módulo interage com módulos Core?

### 6. Existe auditoria?
Todo evento de domínio relevante (criado/rejeitado/cancelado/convertido) chama `auditLog()` com `event` estável + `correlationId` + `workspaceId` + `entity`/`entityId` (ADR-012)? Nenhum dado sensível em log?

### 7. Existe observabilidade?
Operações de escrita transacional e leituras agregadas pesadas envolvidas em `timed()` (`src/lib/metrics.ts`)? Contadores para rejeições/conflitos relevantes? (RC-3.5 — a observabilidade do Financeiro é o padrão.)

### 8. Existe retry?
Toda escrita multi-coleção usa `$transaction` em forma de callback + `withTransactionRetry()` (ADR-003/013)? **Pré-requisito**: a operação retentada é idempotente ou é uma atribuição convergente — se não for nenhuma das duas, o retry é perigoso e a resposta certa é primeiro resolver a pergunta 8b: operações não-idempotentes por natureza (criar pedido, gerar cobrança) têm chave de idempotência gerada no cliente + índice único (ADR-002)?

### 9. Existe Workspace?
Toda entidade nova tem `workspaceId` direto no schema (ADR-006)? Toda query o inclui na própria cláusula (nunca só confiando no chamador — ADR-007)? Para entidades-filhas sem campo direto (raro, justificar): filtro por relação com o pai + pré-checagem em operações de `where` único (ADR-015)? Todo índice composto começa com `workspaceId`?

### 10. Existe RBAC?
Mapa `PERMISSIONS` atualizado com as permissões `verbo:recurso` do módulo? Decisão explícita sobre visibilidade: o módulo herda `read:*` universal ou restringe como o Financeiro (`view:*` explícito por papel — ADR-007)? Compras, por precedente, deve restringir (preço de fornecedor é sensível).

### 11. Existe Soft Delete?
Para cada entidade: arquivar, bloquear, ou excluir fisicamente — decidido caso a caso com a pergunta do ADR-008 ("pode ter histórico financeiro vinculado, hoje ou no futuro, direta ou transitivamente?"). Cadeias de conversão têm guard em TODOS os elos, não só no último (ADR-014 — Oportunidade/Proposta ganharam guard um nível acima de Projeto).

### 12. Existe estratégia de testes?
Dois níveis (`ENGINEERING_STANDARDS.md` §4): mockados para invariantes/erros/formato de chamada; **concorrência real contra MongoDB** (script throwaway, resultado documentado) para qualquer invariante que dependa de comportamento transacional — mocks estruturalmente não capturam essa classe de bug (a lição mais importante do RC-2/RC-3). Sem inflar cobertura: repositories CRUD finos sem lógica não precisam de teste dedicado.

### 13. Existe estratégia de índices?
Índices declarados no schema junto com as queries que os usam, confirmados com `explain()` (`IXSCAN`, não `COLLSCAN`) contra volume realista — não especulativos (`ENGINEERING_STANDARDS.md` §6).

### 14. Existe estratégia de performance?
As leituras do caminho quente foram medidas contra dados sintéticos em volume realista ANTES do módulo ser dado como pronto (`PERFORMANCE_GUIDE.md`, processo obrigatório)? Se houver denormalização: as duas condições de segurança da ADR-011 verificadas e documentadas? Gatilhos de otimização futura (rollup, cache) documentados com números, não adiados sem registro?

---

## Modelo de resposta (copiar para o design doc do módulo)

| # | Pergunta | Resposta (com link/citação) |
|---|---|---|
| 1 | Aggregate + invariantes | |
| 2 | Repository | |
| 3 | Service | |
| 4 | ADR | |
| 5 | Documentação | |
| 6 | Auditoria | |
| 7 | Observabilidade | |
| 8 | Retry + idempotência | |
| 9 | Workspace | |
| 10 | RBAC | |
| 11 | Soft Delete | |
| 12 | Testes | |
| 13 | Índices | |
| 14 | Performance | |
