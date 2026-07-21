# Vincel Studio — Pull Request Guide

**Status**: VIGENTE — Sprint 1 (Platform Freeze 2.0), 2026-07-15
**Escopo**: o checklist obrigatório de todo PR. Consolida e substitui o checklist informal de `ENGINEERING_STANDARDS.md` §8 (que passa a apontar para cá). Dois níveis: itens **bloqueantes** (revisão pede mudança, sem exceção) e itens **de julgamento** (revisor avalia proporcionalidade).

**Princípio**: um checklist só funciona se for proporcional — um PR de correção de typo não precisa responder 11 seções. Aplica-se cada seção **somente quando o PR toca a superfície correspondente**; a responsabilidade de identificar quais seções se aplicam é de quem abre o PR, e a de conferir é do revisor.

---

## 1. Arquitetura *(bloqueante quando toca módulo Core ou cria padrão)*

- [ ] Mudança estrutural em módulo Core tem ADR aprovada antes do código (`ARCHITECTURE_GOVERNANCE.md` §1)?
- [ ] Nenhuma dependência nova viola `CORE_MODULE_POLICY.md` (em particular: nada de produto importado por Finance; nenhuma dependência circular nova)?
- [ ] Rotas importam do barrel do módulo (`<modulo>.module.ts`), nunca de services internos diretamente?
- [ ] Nenhuma lógica de negócio em rota/controller — rotas fazem parse → permissão → service → resposta, nada mais?

## 2. Segurança *(bloqueante, sempre)*

- [ ] Toda query nova de dado de domínio filtra por `workspaceId` derivado da sessão, **na própria query** (ADR-006/015)?
- [ ] IDs vindos de URL/params revalidados contra o workspace antes de qualquer leitura/escrita (IDOR)?
- [ ] Toda mutação sensível valida permissão RBAC no backend (não só esconde botão no frontend)?
- [ ] Nenhum segredo/token/PII em log, mensagem de erro, ou resposta de API?
- [ ] Input externo validado com Zod antes de tocar qualquer service?

## 3. Workspace *(bloqueante, sempre que houver entidade ou query nova)*

- [ ] Entidade nova tem `workspaceId` direto no schema — ou justificativa registrada + filtro por relação (ADR-015)?
- [ ] Índice composto novo começa com `workspaceId`?

## 4. Money *(bloqueante quando toca valor monetário)*

- [ ] Nenhum valor monetário persistido como `Float`/`Number` — sempre `BigInt` em centavos (ADR-001)?
- [ ] Toda aritmética/conversão via `@/lib/money` — nenhum `Math.round(x * 100)` novo fora dela? (Se o valor não for dinheiro de verdade — estimativa, score — dizer isso explicitamente no PR.)

## 5. Retry / Transações *(bloqueante quando há escrita multi-coleção)*

- [ ] Escrita multi-coleção usa `$transaction` (forma de callback) + `withTransactionRetry()` com `context` (ADR-003/013)?
- [ ] A operação retentada é idempotente ou convergente — e se não for por natureza, tem chave de idempotência + índice único (ADR-002)?
- [ ] Se duas operações independentes podem competir pelo mesmo aggregate: mecanismo de serialização identificado (ADR-004)?

## 6. Logging / Observabilidade *(julgamento — bloqueante para eventos de domínio)*

- [ ] Evento de domínio relevante (criado/rejeitado/cancelado) usa `auditLog()`, não `logger.*` com objeto montado à mão (ADR-012)?
- [ ] Nenhum `event` existente renomeado (é contrato — `ARCHITECTURE_GOVERNANCE.md` §3c)?
- [ ] Operação transacional/agregação pesada nova envolvida em `timed()`?

## 7. Performance *(julgamento — bloqueante para query em caminho quente)*

- [ ] Query nova em tela de listagem/dashboard: paginada, e plano confirmado com `explain()` se o volume justificar?
- [ ] Denormalização nova: medição antes/depois + as duas condições da ADR-011 documentadas no PR?
- [ ] Nenhum N+1 novo (query dentro de loop/map sobre resultados de outra query)?

## 8. Exclusão / Arquivamento *(bloqueante quando adiciona rota DELETE)*

- [ ] A pergunta do ADR-008 respondida no PR: "pode ter histórico financeiro vinculado, hoje ou no futuro, direta ou transitivamente?" — se sim/talvez, a rota é archive, e cadeias de conversão têm guard (ADR-014)?

## 9. Testes *(bloqueante, sempre que há comportamento novo)*

- [ ] Comportamento real novo (branch, invariante, guard) coberto — não só caminho feliz?
- [ ] Nenhum teste adicionado só para inflar cobertura (CRUD fino sem lógica)?
- [ ] Invariante que depende de comportamento transacional do MongoDB: teste de concorrência real executado e resultado citado no PR (mocks não bastam — lição RC-2/RC-3)?
- [ ] Mocks usam `mockResolvedValueOnce` onde o valor não deve vazar entre testes (lição RC-2: `vi.clearAllMocks()` não limpa implementações persistentes)?

## 10. Breaking Changes *(bloqueante quando o contrato muda)*

- [ ] Seção "Breaking Changes" do PR preenchida se: campo de resposta removido/renomeado/retipado, parâmetro tornado obrigatório, `ErrorCode`/`event`/métrica renomeado, schema com backfill necessário?
- [ ] Estratégia declarada: transição em duas releases, ou deploy coordenado explícito (`ARCHITECTURE_GOVERNANCE.md` §3)?
- [ ] Migração de dados: script `scripts/migrate-*.ts` idempotente, com a ordem backfill→push correta (§5)?

## 11. Documentação *(julgamento — bloqueante para módulo/padrão novo)*

- [ ] ADR criada/atualizada quando exigida (§1 da governança)?
- [ ] Docs vivos atualizados quando o estado que eles descrevem mudou (`DOMAIN_GUIDE.md`, `CORE_MODULE_POLICY.md`, `ENGINEERING_STANDARDS.md`)?
- [ ] Comentários de código explicam restrições que o código não consegue mostrar (padrão da casa) — não narram o óbvio?

---

## Modelo de descrição de PR

```markdown
## O que muda
<uma frase por mudança relevante — o que, não como>

## Por quê
<motivação/risco/link para ADR ou achado de sprint>

## Seções do checklist aplicáveis
<ex.: 2, 3, 5, 9 — e qualquer resposta que não seja um simples "ok">

## Breaking Changes
<"Nenhuma" ou a lista com estratégia de transição>

## Como foi verificado
<testes rodados, medições feitas, verificação em browser se UI>
```
