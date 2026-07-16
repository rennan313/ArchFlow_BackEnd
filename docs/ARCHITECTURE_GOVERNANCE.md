# ArchFlow — Architecture Governance

**Status**: VIGENTE — Sprint 1 (Platform Freeze 2.0), 2026-07-15
**Escopo**: o processo formal que rege mudanças arquiteturais a partir desta sprint. Complementa `CORE_MODULE_POLICY.md` (o *quê* é protegido) com o *como* mudar. O princípio central, herdado da Release 1.0: **nenhuma decisão registrada é alterada silenciosamente** — precedente já exercido na prática pela Sprint 0 (ADR-012 a 015 generalizaram ADRs do Financeiro criando registros novos, nunca editando os originais).

---

## 1. Quando uma ADR é obrigatória

Uma ADR (no arquivo de decisões do módulo — `FINANCIAL_ARCHITECTURE_DECISIONS.md`, `CORE_ARCHITECTURE_DECISIONS.md`, ou um novo `<MODULO>_ARCHITECTURE_DECISIONS.md`) é **obrigatória antes do código** quando a mudança:

1. Altera o **schema** de um módulo Core (campo novo em `Payment`, índice novo em coleção financeira, mudança de tipo).
2. Altera o **contrato público** de um módulo Core — assinatura de função exportada pelo barrel (`financial.module.ts`), formato de resposta de API consumida pelo frontend, semântica de um `ErrorCode` ou `event` existente.
3. Cria um **padrão novo** que outros módulos vão seguir (foi o caso de `auditLog`, `withTransactionRetry`, o guard-write do ADR-004) — mesmo que a implementação seja pequena.
4. Contradiz ou cria **exceção** a uma ADR existente — a exceção precisa do seu próprio registro com justificativa (ver Anexo D do doc financeiro: Billing/Float é exatamente uma exceção não formalizada aguardando essa ADR).
5. Adiciona ou remove um módulo da lista Core (`CORE_MODULE_POLICY.md`).
6. Muda uma **regra de dependência** entre bounded contexts (`DOMAIN_GUIDE.md` §6).

Uma ADR **não** é necessária para: bug fix sem mudança de contrato, teste novo, refatoração interna que preserva o contrato público (renomear variável local, extrair função privada), log/métrica adicional, documentação.

**Formato**: o já usado nos dois arquivos existentes — Problema, Alternativas consideradas, Solução escolhida, Justificativa, Impacto futuro. Numeração sequencial global (próxima: ADR-016), independente do arquivo onde mora.

**Regra de imutabilidade**: uma ADR publicada nunca é reescrita. Se uma decisão mudar, a ADR nova referencia e supersede a antiga (`**Status**: Supersedida por ADR-0XX`), e a antiga ganha só essa anotação de status — o histórico do porquê de cada época permanece legível.

## 2. Quando uma refatoração precisa de aprovação

| Tipo de refatoração | Processo |
|---|---|
| Interna a uma função/arquivo, contrato preservado | PR normal |
| Move código entre arquivos do mesmo módulo, contrato do barrel preservado | PR normal, checklist de PR |
| Muda contrato público de módulo **não-Core** | PR com seção "Breaking Changes" preenchida (`PULL_REQUEST_GUIDE.md`) |
| Muda contrato público de módulo **Core** | ADR primeiro (§1.2) |
| Atravessa fronteira de bounded context (ex.: mover lógica de Compras para dentro do Finance) | ADR primeiro (§1.6) — na prática, quase sempre a resposta é "não faça" (regra de uma via só) |
| "Grande refatoração" (fusão de aggregates, troca de padrão transversal) | ADR + entrada no roadmap — nunca dentro de uma sprint de feature. Precedente: a fusão FinancialDocument+Installment+Payment foi avaliada e adiada na RC-3.1 exatamente por essa regra |

## 3. Quando uma mudança pode quebrar compatibilidade

Compatibilidade tem três superfícies no ArchFlow, com regras distintas:

**a) API HTTP (backend ↔ frontend)** — os dois deploys não são atômicos; uma janela onde o frontend antigo fala com o backend novo sempre existe. Regra: mudanças aditivas (campo novo na resposta, parâmetro opcional novo) são livres; remover/renomear campo ou tornar parâmetro obrigatório exige ou (a) fase de transição em duas releases (adicionar novo → migrar frontend → remover velho), ou (b) janela de deploy coordenado explicitamente anotada no PR. Precedente real: a migração BigInt (RC-2.2) mudou `*Cents` de `number` para `string` na resposta — foi tratada como breaking change coordenada, com o frontend migrado no mesmo ciclo.

**b) Schema/dados (MongoDB)** — sem migrations automáticas (Mongo + `db push`); toda transformação de dados existentes é um script `scripts/migrate-*.ts` (regras em `ENGINEERING_STANDARDS.md` §5). Campo novo obrigatório em coleção com dados exige backfill ANTES do `db push` que cria o índice/constraint (precedente: `idempotencyKey`, RC-2.2). Mudança de tipo exige script com `$runCommandRaw` rodando com o client antigo.

**c) Contratos implícitos** — `event` names do `auditLog` (nunca renomear), `ErrorCode` strings (o frontend pode fazer match por código), nomes de métricas (`financial.*`). Todos seguem a regra "adicionar é livre, renomear/remover é breaking".

## 4. Como evoluir Aggregates

Referência: `DOMAIN_GUIDE.md` §2. Regras:

1. **Invariantes primeiro**: antes de adicionar campo/entidade a um aggregate, escrever qual invariante novo (ou existente) ele afeta. Se a mudança enfraquece um invariante existente (ex.: tornar `direction` mutável quebraria as duas condições da ADR-011), é ADR obrigatória.
2. **Filhos novos entram pela raiz**: uma entidade nova dentro de um aggregate existente (ex.: um futuro `PaymentReversal` sob `Payment`) escreve via transação com a raiz, herda os guards da raiz (idempotência, guard-write de cancelamento), e nunca ganha um caminho de escrita que contorne o repository da raiz.
3. **Fusão/divisão de aggregate é sempre ADR + roadmap** (ver §2, última linha) — o custo de reescrever o schema só se paga quando medido, mesmo raciocínio da ADR-011 para denormalização.
4. **Append-only é irreversível**: uma coleção declarada append-only (`Payment`) nunca ganha rota de update/delete depois — correções são sempre registros compensatórios (estorno como lançamento novo, nunca edição).

## 5. Como evoluir o banco

1. Todo campo novo em coleção existente nasce **opcional** ou com **default** — nunca obrigatório-sem-default sobre dados existentes.
2. Se precisar ser obrigatório/único: script de backfill primeiro (`scripts/migrate-*.ts`, idempotente, mantido no repo), `prisma db push` depois. Ordem inversa quebra o índice único (precedente documentado: RC-2.2).
3. Índice novo: justificar com `explain()` mostrando a query real que o usará (`ENGINEERING_STANDARDS.md` §6) — índices especulativos são custo de escrita sem benefício.
4. Remoção de campo: duas fases — (1) código para de ler/escrever o campo (release N), (2) campo sai do schema + script de limpeza opcional (release N+1). Nunca as duas coisas no mesmo deploy.
5. Deletes em massa por script: sempre em loop até zero removidos (`PERFORMANCE_GUIDE.md`, Armadilhas operacionais).

## 6. Como evoluir APIs públicas

"Pública" hoje = consumida pelo frontend ArchFlow; no futuro (Portal do Cliente, Mobile, API externa do roadmap) = consumida por clientes que não controlamos e não fazem deploy conosco.

1. **Aditivo por padrão** (§3a). Resposta de API é um contrato — campos nunca mudam de tipo ou semântica silenciosamente.
2. **Validação Zod é a fronteira**: parâmetro novo entra como `.optional()` primeiro; vira obrigatório só depois que todos os chamadores enviam.
3. **Versionamento por URL só quando houver consumidor externo real**: hoje não há `/api/v2/` e não deve haver até o Portal do Cliente/Mobile existirem — versionar sem consumidor externo é manutenção dupla sem benefício. O rewrite `/api/v1/[[...path]]` existente já reserva o espaço de nomes para quando chegar a hora.
4. **Erros são API**: `ErrorCode` + HTTP status de um erro existente não mudam (§3c); casos novos ganham códigos novos.

## 7. Como versionar mudanças

- **Código**: trunk-based com PRs para `master` (fluxo atual). Branches de fase para trabalho grande (precedente: billing phase B), merge com mensagem descritiva por sprint.
- **Decisões**: ADRs numeradas sequencialmente, globais, imutáveis (§1).
- **Releases**: nomeadas por marco (`Release 1.0 — Finance Foundation`), com `RELEASE_NOTES` dedicado por escopo. Breaking changes sempre listadas na release note, mesmo as coordenadas.
- **Documentos vivos** (`ENGINEERING_STANDARDS.md`, este arquivo, `DOMAIN_GUIDE.md`): atualizados em qualquer sprint, com a mudança citada no relatório da sprint — diferente de ADRs, estes PODEM ser editados, porque descrevem o estado atual, não decisões históricas.
- **Schema**: o `schema.prisma` no repo é a verdade; scripts de migração numerados por contexto (`migrate-money-fields-to-bigint`, `migrate-backfill-payment-projectid`) permanecem no repo como histórico executável de como cada dado chegou onde está.
