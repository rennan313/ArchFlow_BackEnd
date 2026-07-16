# ArchFlow — Architecture Health Report

**Data**: 2026-07-15 — Sprint 1 (Platform Freeze 2.0)
**Escopo**: Partes 6 (mapa de dependências) e 7 (auditoria de saúde) da Sprint 1. Verificado contra o código real via busca de imports — não de memória.

---

## Parte 6 — Mapa oficial de dependências

### Verificação executada (imports reais, não intenção)

| Verificação | Resultado |
|---|---|
| `src/lib/money/` importa algo do app? | **Não** — zero imports internos (folha absoluta, confirmado) |
| `src/lib/auditLog.ts` importa algo além de logger/correlationId? | **Não** |
| `src/modules/financial/` importa algum service/módulo de produto? | **Não** — zero ocorrências de `from "@/services/` ou `from "@/modules/` (exceto o próprio barrel) |
| Quem importa `@/modules/financial`? | 22 rotas (todas via barrel `financial.module.ts` ✔), `client.service.ts` + `project.service.ts` (guards read-only RC-2.3, via barrel ✔), 12 arquivos de teste (importam services internos diretamente — aceitável para teste, não é contrato de runtime) |
| `workspace.service.ts` importa o quê? | `automation.service` (seed de defaults) + `subscription.service` (trial inicial) — ambas documentadas como aceitas em `CORE_MODULE_POLICY.md` §2 |

### Conclusões

- **Dependência circular**: nenhuma encontrada. A árvore é estritamente acíclica: Money/Logging são folhas; Retry→Logging; Finance→infraestrutura apenas; produto→Finance numa via só e read-only.
- **Acoplamento indevido**: nenhum novo. Os dois acoplamentos "de conveniência" conhecidos (Workspace→Automations e Workspace→Subscription na criação de workspace) são aceitos e registrados na política — são orquestração de provisionamento, não vazamento de domínio. Se o provisionamento crescer, o caminho correto é um orquestrador de onboarding dedicado, não mais imports no Workspace (anotado no roadmap).
- **Violação de bounded context**: nenhuma. A regra de uma via só (`DOMAIN_GUIDE.md` §6) se sustenta no código: Finance não conhece nenhum módulo acima dele.

O diagrama oficial vive em `CORE_MODULE_POLICY.md` (seção "Mapa de dependências entre módulos Core") — este relatório confirma que ele reflete o código real na data acima.

---

## Parte 7 — Auditoria de saúde

### O Core continua seguindo os padrões?

**Sim.** As quatro verificações estruturais principais (workspace-scoping em query, retry em escrita multi-coleção, barrel como único ponto de import, Money Library para todo dinheiro do ledger) foram re-confirmadas por busca no código durante esta sprint. As correções da Sprint 0 (CORE-1 a CORE-6) permanecem íntegras — nenhuma regressão introduzida desde então (build, type check, lint e 513/515 testes passando; as 2 falhas restantes são as pré-existentes de `provision.service.ts`, documentadas e não relacionadas).

### Existe código legado que deve entrar no roadmap?

Sim — três itens, todos já documentados, consolidados aqui como backlog oficial:

1. **`src/lib/events.ts`** (Auth/IA) — padrão de log legado, superseded pelo ADR-012. Migração gradual: cada arquivo que o usa migra para `auditLog` quando for tocado por outro motivo. Inclui remover as entradas de catálogo nunca emitidas (`ProposalEvent.*`).
2. **Billing Float→BigInt** — a tensão com o ADR-001 (Anexo D da Release 1.0). Precisa de ADR própria decidindo: migrar, ou formalizar como exceção. Recomendação deste relatório: migrar junto com qualquer trabalho "Billing v2", nunca como projeto isolado.
3. ~~**Falhas pré-existentes de `provision.service.ts`** (2 testes, caminho de self-healing de senha) — mock incompleto, mesma classe dos que a Sprint 0 consertou em workspace/proposal.~~ **[RESOLVIDO — pós-Sprint 1, mesmo dia]**: mock de `prisma.user.update` adicionado + teste novo cobrindo o branch "sem senha" (Google sign-in replay). Suíte completa verde pela primeira vez na série: **516/516**.

### Existe módulo com dívida técnica crescente?

**Não crescente** — este é o ponto central: toda dívida conhecida está estável e documentada, nenhuma está acumulando juros silenciosamente. Billing é o módulo com a maior dívida absoluta (Float, logs de texto livre, sem retry além do `changePlan` já corrigido), mas está funcionalmente estável e sem desenvolvimento ativo que a amplie. O risco de crescimento real estaria em Compras nascer fora dos padrões — exatamente o que esta sprint de governança existe para impedir.

### Existe risco futuro?

Em ordem de probabilidade × impacto:

1. **Rollup de Analytics adiado além do gatilho** — o dashboard cresce ~linearmente com o volume (940ms a 300k pagamentos). O gatilho documentado (`PERFORMANCE_GUIDE.md` §3, ~2s) precisa ser *observado* — hoje as métricas são em processo e ninguém as olha automaticamente. Mitigação: quando houver deploy de produção com volume real, expor `getMetricsSnapshot()` num endpoint interno/health e revisar mensalmente.
2. **Portal do Cliente introduz a segunda dimensão de escopo** (`clientId` dentro do workspace) — o maior desafio arquitetural do roadmap; se for construído reaproveitando endpoints internos sem auditoria de campo a campo, vira o vetor de vazamento nº 1. Mitigação já escrita: `ARCHITECTURE_ROADMAP.md` §3.
3. **Crescimento de equipe sem enforcement automatizado** — a governança desta sprint é processo escrito; nada impede mecanicamente um PR de violá-la. Mitigação futura (roadmap): lint rules customizadas (proibir `prisma.` fora de repositories, proibir import de módulo de produto dentro de `src/modules/financial/`) — transformar as regras mais mecânicas da política em CI.
4. **Timezone fixo UTC-3** — risco dormente conhecido (ADR-005): se o Brasil reinstituir horário de verão ou o produto expandir de país, `dateOnly.ts` precisa de biblioteca IANA real. Gatilho externo, monitorar.

### Nota geral da plataforma: **94/100** *(93 na publicação original; +1 após a suíte ficar 100% verde no mesmo dia — ver item 3 do backlog acima)*

| Dimensão | Nota | Justificativa |
|---|---|---|
| Consistência de padrões | 97 | Core inteiro alinhado (Sprint 0); exceções todas documentadas |
| Segurança multi-tenant | 95 | Workspace-First verificado em todo repository; defesa em profundidade; resta o desafio futuro do Portal |
| Integridade financeira | 98 | Idempotência + retry + guards provados sob concorrência real (500-way) |
| Observabilidade | 85 | Estrutura excelente (auditLog/metrics), mas sem sink externo nem alerta — em processo apenas |
| Testes | 93 | **516/516 (suíte 100% verde)**; concorrência real como prática estabelecida |
| Documentação/governança | 95 | 15 ADRs + 12 documentos; processo formal a partir desta sprint |
| Dívida técnica | 88 | Estável e catalogada (Billing/Float, events.ts), nenhuma crescente |

A distância para 100 é intencional e honesta: observabilidade sem sink externo, enforcement de governança ainda humano (não CI), e a dívida de Billing aguardando a ADR certa — tudo com dono, gatilho e plano, nada desconhecido.

---

## Roadmap técnico — próximos 12 meses

Ordem de dependência técnica (detalhe de cada item: `ARCHITECTURE_ROADMAP.md`):

| Trimestre | Entrega | Pré-requisito técnico |
|---|---|---|
| **T1** | **Compras** (Cotação → Pedido → FinancialDocument via automação) | Fundação congelada (feito); checklist de módulo (feito) |
| T1, paralelo | Fixes de baixo esforço: testes de `provision`, lint rules de governança em CI | — |
| **T2** | **Analytics/rollup materializado** — se o gatilho de volume disparar; senão, endpoint de métricas + revisão mensal | Volume real de produção observado |
| T2 | **Billing v2** — ADR Float→BigInt + migração de logs para `auditLog` + retry nos caminhos restantes | ADR aprovada |
| **T3** | **Portal do Cliente** — sessão de cliente (novo tipo de JWT), escopo `clientId`, superfície read-only estreita | ADR da segunda dimensão de escopo (a mais importante do ano) |
| T3 | **Integrações fase 1**: conciliação bancária (OFX) como provider — padrão `billing/providers` | Compras estável (mesmo padrão de provider) |
| **T4** | **Obras + Mobile** (o caso de uso mobile-first real) | Portal do Cliente (auth de campo reusa aprendizados); idempotência offline (chave gerada na ação, não no envio — `ARCHITECTURE_ROADMAP.md` §5) |
| T4 | **Centro de Inteligência / IA financeira** — recomendações via Analytics, escrita sempre pelos services normais | Analytics (T2) existindo como camada de leitura |

Regra transversal do ano: **nenhum item avança sem passar pelo `MODULE_CREATION_CHECKLIST.md` e pelo `DEFINITION_OF_DONE.md`** — o roadmap é sequência de produto; a governança é invariante.
