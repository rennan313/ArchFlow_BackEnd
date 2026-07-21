# Vincel Studio — Engineering Standards

**Status**: Release 1.0 (Finance Foundation), 2026-07-15
**Escopo**: como construir qualquer módulo novo no backend Vincel Studio, extraído e formalizado a partir do módulo Financeiro. Todo exemplo abaixo aponta para código real do Financeiro — leia o exemplo antes de escrever o seu.

Este documento assume familiaridade com `FINANCIAL_ARCHITECTURE_DECISIONS.md` (o "porquê") — aqui é o "como", passo a passo.

---

## 1. Como criar um módulo novo

Estrutura de referência (`src/modules/financial/`, `src/modules/billing/`):

```
src/modules/<nome>/
  <nome>.module.ts      ← barrel: único ponto de import para rotas
  services/
    <entidade1>.service.ts
    <entidade2>.service.ts
  providers/             ← só se houver integração externa (ex.: billing/providers)
  webhooks/              ← só se houver webhook externo
```

Repositories **não** vivem dentro do módulo — ficam em `src/repositories/*.repository.ts`, compartilhado por toda a aplicação (confirmado como convenção real, não teórica: nem `financial/` nem `billing/` têm uma pasta `repositories/` própria).

`<nome>.module.ts` exporta só o que rotas devem importar:

```ts
// financial.module.ts — o padrão a copiar
export { supplierService }              from "./services/supplier.service"
export { installmentService }           from "./services/installment.service"
export { financialDashboardService }    from "./services/financialDashboard.service"
// ...
```

Rotas (`src/app/api/**/route.ts`) importam **do barrel**, nunca de `services/xxx.service.ts` diretamente — isso é o que torna refatorações internas do módulo seguras sem quebrar rotas.

**Checklist de módulo novo**:
- [ ] `<nome>.module.ts` existe e é o único ponto de import externo.
- [ ] Repositories em `src/repositories/`, não dentro do módulo.
- [ ] Toda entidade nova tem `workspaceId` como campo direto no schema (ADR-006) — a menos que seja dado de referência público sem tenant (como `State`/`City`).
- [ ] Mapa de permissões (`src/middlewares/rbac.ts`) atualizado explicitamente — nunca herdar `read:*` por padrão se o domínio tiver alguma razão de negócio para restringir visibilidade.

---

## 2. Como criar um Service

Um Service:
- Recebe `workspaceId` como parâmetro explícito em toda função pública (nunca lê de contexto global).
- Nunca chama `prisma` diretamente — sempre via Repository.
- Lança `AppError(ErrorCode.X)` para qualquer falha de negócio (nunca `throw new Error("string")` solto — a camada de rota depende de `ErrorCode` para mapear a resposta HTTP certa, ver `src/utils/serviceError.ts`).
- `getById` é sempre a mesma forma: busca via repository, `if (!x) throw new AppError(ErrorCode.X_NOT_FOUND)`, retorna. Todo outro método que precisa do recurso primeiro chama `this.getById(...)` — nunca duplica a checagem de existência.

```ts
// Padrão de referência — installment.service.ts (resumido)
export const installmentService = {
  async getById(id: string, workspaceId: string) {
    const installment = await installmentRepository.findById(id, workspaceId)
    if (!installment) throw new AppError(ErrorCode.INSTALLMENT_NOT_FOUND)
    return installment
  },
  async registerPayment(installmentId: string, workspaceId: string, userId: string, input: RegisterPaymentInput) {
    // 1. fast-path de idempotência (ADR-002)
    // 2. valida referências de outros módulos via assertWorkspaceReferences (nunca confia no id cru)
    // 3. delega a escrita real ao repository (services nunca escrevem no banco diretamente)
    // 4. log de auditoria via auditLog() — event+correlationId+workspaceId+
    //    entity/entityId, nunca logger.* direto com objeto montado à mão
    //    (CORE_ARCHITECTURE_DECISIONS.md, ADR-012)
  },
}
```

**Validação de entrada**: todo input de rota/Server Action passa por um schema Zod (`src/validations/<entidade>.ts`) antes de tocar o service — nunca confiar em `req.json()` bruto.

**Dinheiro**: todo Service que lida com valores monetários importa de `@/lib/money`, nunca reimplementa `reaisToCents`/arredondamento localmente (ADR-001). Se você está prestes a escrever `Math.round(x * 100)` em qualquer lugar fora de `src/lib/money/`, pare — ou o valor não é dinheiro de verdade (então documente isso explicitamente), ou você deveria estar chamando a Money Library.

---

## 3. Como criar um Repository

Toda função de leitura/escrita:
- Recebe `workspaceId` e o inclui **na própria query**, mesmo que o chamador já tenha validado (ADR-006/007) — nunca "vou confiar que quem me chamou já checou".
- Retorna dados crus do Prisma (tipos gerados) — nunca formata para exibição (isso é trabalho do frontend/`formatCentsBRL` só para logs de backend).
- Uma escrita que toca mais de uma coleção é sempre `prisma.$transaction`, envolvida por `withTransactionRetry()` (ADR-003) — nunca `$transaction` cru.

```ts
// Padrão de referência — financialDocument.repository.ts (resumido)
export const financialDocumentRepository = {
  findById(id: string, workspaceId: string) {
    return prisma.financialDocument.findFirst({ where: { id, workspaceId } })  // workspaceId sempre na query
  },

  // Escrita multi-coleção: $transaction + withTransactionRetry, nunca só um dos dois
  createWithInstallments(input: CreateWithInstallmentsInput, correlationId = newCorrelationId()) {
    return timed("financial.createWithInstallments", () => withTransactionRetry(() =>
      prisma.$transaction(async (tx) => {
        const doc = await tx.financialDocument.create({ data: { ...input, totalAmountCents } })
        await tx.installment.createMany({ data: /* ... */ })
        logger.info({ correlationId, event: "document_created" }, "[audit] financial document created")
        return doc
      }),
    { context: { correlationId, op: "createWithInstallments" } }))
  },
}
```

**Guard-write para races entre agregados** (ADR-004): se sua escrita pode correr contra uma escrita de OUTRO fluxo tocando o mesmo agregado por um caminho diferente, faça as duas escreverem genuinamente no mesmo documento (mesmo que uma delas não precisasse por razão de negócio) — não implemente lock manual antes de considerar essa opção primeiro.

---

## 4. Como escrever testes

**Dois níveis, cada um com um propósito diferente — não são substitutos um do outro**:

### 4.1 Testes mockados (`vitest run`, padrão para 95%+ dos casos)

`vi.mock("@/lib/prisma", ...)` — mock inline por arquivo de teste (não um mock global compartilhado para o domínio financeiro; ver `src/__tests__/setup.ts` para o que É mockado globalmente: só os módulos usados por múltiplos domínios). Cobrem: invariantes de negócio, casos de erro, formato exato dos argumentos passados ao Prisma.

```ts
vi.mock("@/lib/prisma", () => {
  const mock = { installment: { findFirst: vi.fn(), update: vi.fn() }, /* ... */ }
  return { prisma: mock }
})
```

**Não infle cobertura artificialmente** — um repository CRUD fino (`create`/`update`/`findById` sem lógica própria) não precisa de um teste dedicado se já é exercitado indiretamente por um teste de service com o repository mockado. Teste onde existe comportamento real: cálculo, invariante, branch condicional, guard.

### 4.2 Testes de concorrência real (scripts throwaway, não `vitest run`)

Para qualquer invariante que depende de comportamento real do MongoDB sob concorrência (write conflicts, corridas entre transações) — **testes mockados estruturalmente não conseguem capturar essa classe de bug**. O achado mais importante de toda a série RC-2/RC-3 (o bug de idempotência sob retry, e a race condition de cancelamento×pagamento) só apareceu rodando `Promise.all`/`Promise.allSettled` contra MongoDB real.

Padrão: script em `scripts/rc-*-check.ts` (nunca committed permanentemente — roda uma vez, documenta o resultado em markdown, é apagado), que:
1. Cria fixtures reais num workspace descartável.
2. Dispara N chamadas concorrentes via `Promise.allSettled`.
3. Verifica o estado final do banco (não confia só no retorno das promises).
4. Limpa tudo no final — com `$runCommandRaw` em loop, não `prisma.deleteMany({ where: { workspaceId } })` sozinho (ver §6, "MongoDB delete tem teto por chamada").
5. Usa log em arquivo (`appendFileSync`), nunca só `console.log` — um processo em background com `prisma:query` debug ligado enche o stdout redirecionado antes de qualquer log seu aparecer.

Resultado do script vira uma tabela no ADR ou no relatório da sprint — não fica só na memória de quem rodou.

### 4.3 Metas de cobertura

Escopo do "motor financeiro" (repositories + services do módulo + money lib): medir separadamente do resto do app (`coverage-final.json` filtrado por caminho) — o threshold global do `vitest.config.ts` mistura tudo e não reflete a saúde real de um módulo específico. Referência atual pós-RC-3: ~78% statements / ~63% branches / ~69% functions no motor financeiro.

---

## 5. Como criar migrations

MongoDB não tem migrations de schema no sentido SQL — `prisma db push` aplica o schema direto. "Migration" aqui significa **script de transformação de dados existentes**, sempre em `scripts/migrate-*.ts`.

Regras:
- Roda com `npx tsx scripts/migrate-xxx.ts`, nunca via `vitest` ou como parte do `npm run build`.
- Idempotente sempre que possível (rodar duas vezes não deve corromper nada) — checar `if (campo já preenchido) continue` antes de escrever.
- Para poucos milhares de linhas (volume real do ambiente atual, pré-lançamento): loop por linha é aceitável e mais simples de auditar/depurar (`scripts/migrate-money-fields-to-bigint.ts`, `scripts/migrate-backfill-payment-projectid.ts`).
- Para centenas de milhares+ de linhas: `$runCommandRaw` com pipeline de update em massa — mas **`$lookup` não é permitido dentro de um pipeline de `update`** (MongoDB rejeita com `code 72`); se a migration precisa de dados de uma coleção relacionada, ou é loop por linha, ou é uma agregação com `$merge` escrevendo de volta na mesma coleção.
- Migrations que alteram o TIPO de um campo existente (ex. Int32→Int64) rodam **antes** de `prisma db push` aplicar o novo schema, usando o client antigo + `$runCommandRaw` — nunca dependa do client novo já gerado para uma migração que prepara dados para esse mesmo schema novo.
- Scripts de migration permanecem no repositório (não são apagados como os throwaway de verificação, §4.2) — são referência de como aquele dado histórico foi tratado, e podem precisar rodar de novo em outro ambiente (staging, produção).

---

## 6. Como criar índices

Todo índice composto usado por uma query financeira começa com `workspaceId` (ADR-006) — a query sempre filtra por workspace primeiro, então o índice deve refletir isso na ordem dos campos.

```prisma
@@index([workspaceId, direction, paidAt])         // dashboard: filtra workspace+direction, ordena/filtra por data
@@index([workspaceId, projectId, direction])      // resumo por projeto (RC-3.3)
```

**Antes de adicionar um índice**: confirmar com `explain()` (`verbosity: "queryPlanner"`) que a query realmente usa `IXSCAN` no índice esperado, não `COLLSCAN`. Um índice que existe mas não é usado pela query real (ordem de campos errada, ou a query filtra por algo que não está no prefixo do índice) é manutenção sem benefício.

**Lição de operação (não teórica)**: `$runCommandRaw` com `delete`/`deleteMany` pode silenciosamente ter um teto de quantos documentos remove por chamada, mesmo com `limit: 0` — descoberto na prática ao limpar dados de teste em massa (ver `PERFORMANCE_GUIDE.md`, §"Armadilhas operacionais"). Qualquer delete em massa por script deve rodar em loop até uma chamada reportar zero removidos, nunca assumir que uma chamada limpou tudo.

---

## 7. Como validar performance antes de mergear

Checklist obrigatório para qualquer query nova que roda no caminho de leitura de uma tela (dashboard, listagem, resumo agregado):

1. **Meça, não estime.** Seed sintético em volume realista (não 10 linhas de teste manual) — RC-3.3 só descobriu o gargalo de 30 segundos porque alguém rodou a query contra 100 mil linhas reais, não porque alguém "achou que devia ser lento".
2. **`explain()` antes de otimizar.** Confirme se o plano de execução usa índice (`IXSCAN`) ou varredura completa (`COLLSCAN`) antes de decidir SE precisa de mudança, e qual mudança.
3. **Se a resposta for "denormalizar"**, confirme as duas condições de segurança do ADR-011 antes de implementar (campo de origem imutável + documento append-only) — ver `PERFORMANCE_GUIDE.md` para o processo completo.
4. **Documente o número medido**, não só a mudança feita — um "ficou mais rápido" sem baseline não é verificável por ninguém depois.

---

## 8. Como implementar Arquivar/Restaurar/Cancelar (Entity Lifecycle, ADR-020)

Toda entidade nova que precisa de um botão "excluir" na UI, mas cujo domínio nunca deve perder o registro de verdade, segue este padrão — não reimplementa seu próprio arquivamento.

**Passo a passo**:

1. **Schema**: adicione exatamente `archived Boolean @default(false)`, `archivedAt DateTime?`, `archivedBy String? @db.ObjectId`, e `@@index([workspaceId, archived])`. Nunca reaproveite `status`/`active`/`inactive` já existentes na entidade para este propósito — são conceitos diferentes (ver `DOMAIN_GUIDE.md` §7).
2. **Allow-list**: adicione o nome do model a `ARCHIVABLE_MODELS` em `src/lib/prisma.ts` — é isso que ativa a filtragem automática de `archived: false` em toda listagem normal (`findMany`/`count`/`aggregate`/`groupBy`) sem precisar tocar em nenhum repository.
3. **Service**: delegue a `entityLifecycleService.archive()`/`.restore()` (import de `@/services/entityLifecycle.service`), passando `delegate: prisma.<model>`, `entity: "<NomeDoModel>"`, e qualquer `guard`/`integrityCheck` específico da entidade como callback:

```ts
// Padrão de referência — client.service.ts (resumido)
async delete(id: string, workspaceId: string, userId: string) {
  await this.getById(id, workspaceId)
  await entityLifecycleService.archive({
    entity: "Client", id, workspaceId, userId,
    delegate: prisma.client,
    guard: async () => {
      if (await financialDocumentService.hasDocumentsForClient(id, workspaceId)) {
        throw new AppError(ErrorCode.CLIENT_HAS_FINANCIAL_HISTORY)
      }
    },
  })
},
async restore(id: string, workspaceId: string, userId: string) {
  await entityLifecycleService.restore({
    entity: "Client", id, workspaceId, userId,
    delegate: prisma.client,
  })
  return clientRepository.findById(id, workspaceId)
},
```

4. **Rota**: `DELETE` já existente passa a receber `user.sub` como `userId` (nunca `_user` descartado — `archivedBy` depende disso). Adicione `src/app/api/<entidade>/[id]/restore/route.ts`, um `POST` protegido pela MESMA permissão do `DELETE` (restaurar não ganha uma entrada nova em `PERMISSIONS`).
5. **Listagem**: adicione `archived: z.coerce.boolean().optional()` ao schema Zod de query da entidade, e passe `query.archived` para o `where` do repository (`archived: query.archived ?? false`) — isso é o que permite a tela de "Itens Arquivados" pedir `?archived=true` no mesmo endpoint de listagem, sem endpoint dedicado.
6. **Nunca** implemente exclusão física para uma entidade nova sem primeiro provar, por escrito, que ela não pode ter histórico de negócio de terceiros apontando para ela (ver ADR-020, Regras do domínio).

---

## 9. Como revisar Pull Requests (checklist)

Bloqueante — qualquer um destes ausente é motivo para pedir mudança antes de aprovar:

- [ ] Toda query nova de dado de domínio filtra por `workspaceId` derivado da sessão, dentro da própria query (não só validado uma camada acima).
- [ ] Toda mutação sensível (delete, mudança de role, billing) valida permissão RBAC no backend, não só esconde um botão no frontend.
- [ ] IDs de recursos recebidos via URL/params são revalidados contra o workspace do usuário antes de qualquer leitura/escrita.
- [ ] Nenhuma exclusão física de entidade que pode ter histórico financeiro (ou vínculo a montante que leve a histórico financeiro — ver Anexo B de `FINANCIAL_ARCHITECTURE_DECISIONS.md`) sem guard de referência.
- [ ] Nenhum valor monetário novo usa `Number`/`Float` para persistência — sempre `BigInt` em centavos, sempre via `@/lib/money`.
- [ ] Escrita multi-coleção usa `$transaction` + `withTransactionRetry()`, nunca `$transaction` sozinho.
- [ ] Nenhum segredo, token, ou dado sensível em log — só IDs internos e valores já formatados.
- [ ] Testes cobrem o comportamento real adicionado (branch de erro, invariante) — não só o caminho feliz, e não teste de repository CRUD fino sem lógica própria só para inflar número de cobertura.
- [ ] Toda entidade arquivável nova delega a `entityLifecycleService` (§8, ADR-020) — nunca um `updateMany` de arquivamento reimplementado à mão, nunca `status`/`active`/`isArchived` reaproveitado para o mesmo propósito.
