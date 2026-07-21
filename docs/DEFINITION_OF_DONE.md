# Vincel Studio — Definition of Done

**Status**: VIGENTE — Sprint 1 (Platform Freeze 2.0), 2026-07-15
**Escopo**: quando uma sprint (ou um módulo) pode ser declarada encerrada. Formaliza o que as sprints RC-2/RC-3/Sprint 0 já praticavam implicitamente — a partir de agora, é critério explícito, não conhecimento tribal.

**Princípio de proporcionalidade**: nem toda sprint tem todos os itens (uma sprint de documentação não tem stress test; uma sprint de UI não tem migração de dados). A regra é: cada item abaixo é obrigatório **quando a sprint tocou a superfície correspondente** — e o relatório final da sprint declara explicitamente quais itens se aplicaram e quais não (com uma frase de justificativa para os "não se aplica"). Um item aplicável não cumprido = sprint não encerrada, sem exceção.

---

## Critérios básicos (toda sprint, sem exceção)

- [ ] **Build de produção aprovado** — `npm run build` limpo nos repositórios tocados (backend e/ou frontend).
- [ ] **Type check aprovado** — `npx tsc --noEmit` sem erros.
- [ ] **Lint aprovado** — zero erros (warnings pré-existentes documentados não bloqueiam, warnings novos sim).
- [ ] **Testes passando** — suíte completa; falhas pré-existentes não relacionadas são aceitáveis SOMENTE se já documentadas como tal em sprint anterior e comprovadamente não tocadas (precedente: as falhas de `provision.service.ts`). Falha nova = sprint aberta.
- [ ] **Relatório final entregue** — no formato pedido pelo brief da sprint, com números reais (não estimativas) onde números foram pedidos.

## Arquitetura validada *(quando a sprint criou/alterou estrutura)*

- [ ] Toda decisão estrutural registrada como ADR antes do código (`ARCHITECTURE_GOVERNANCE.md` §1).
- [ ] Nenhuma dependência nova violando `CORE_MODULE_POLICY.md`.
- [ ] Módulo novo: as 14 perguntas do `MODULE_CREATION_CHECKLIST.md` respondidas por escrito, com links.

## Performance validada *(quando a sprint tocou caminho quente de leitura ou escrita)*

- [ ] Medição real contra volume sintético realista — não estimativa (`PERFORMANCE_GUIDE.md`, princípio central). Precedente do porquê: o gargalo de 30s do `projectId` era invisível sem medir.
- [ ] Números antes/depois no relatório para qualquer otimização feita.
- [ ] Gatilhos de otimização futura documentados com número, quando a decisão foi "ainda não" (precedente: rollup materializado, §3 do guia).

## Testes *(quando a sprint tocou comportamento)*

- [ ] Comportamento novo coberto por teste que falharia sem a mudança (regressão real, não tautologia).
- [ ] Invariantes transacionais/concorrentes: verificados contra MongoDB real via script, resultado (números) no relatório — mocks sozinhos não encerram esse item (lição estrutural do RC-2.1/RC-3.1).
- [ ] Cobertura do módulo tocado medida e reportada — sem meta de número inflado; a meta é "todo comportamento relevante coberto".

## Documentação *(quando a sprint mudou o que os docs descrevem)*

- [ ] ADRs novas criadas; ADRs antigas nunca editadas silenciosamente (anotação de status/"ver também" apenas).
- [ ] Docs vivos atualizados (`DOMAIN_GUIDE`, `ENGINEERING_STANDARDS`, `CORE_MODULE_POLICY`, guias) — inclusive marcando achados de auditorias anteriores como resolvidos quando a sprint os resolveu (precedente: Anexo da Release 1.0 atualizado pela Sprint 0).

## Observabilidade *(quando a sprint criou operação de domínio nova)*

- [ ] Eventos de auditoria via `auditLog()` com `event` estável (ADR-012).
- [ ] Métricas (`timed`/contadores) nas operações transacionais e agregações novas.

## Segurança *(quando a sprint tocou query, rota, ou permissão)*

- [ ] Workspace-scoping verificado nas queries novas (na própria query — ADR-006/015).
- [ ] RBAC atualizado para recursos novos; decisão de visibilidade explícita.
- [ ] Nenhum dado sensível em logs/erros introduzido.

## UX *(quando a sprint tocou frontend)*

- [ ] Fluxo real verificado **em navegador de verdade** (Playwright ou manual) contra backend vivo — não só build/type check. Precedente do porquê: o bug de `DOCUMENT_INCLUDE` sem payments aninhados (RC-1) era invisível a qualquer verificação estática; e a Sprint RC-3 fez o smoke completo criar-documento→registrar-pagamento após cada mudança de schema.
- [ ] Zero erros novos no console do navegador durante o fluxo verificado.
- [ ] i18n: strings novas nos 3 idiomas (`messages/{pt,en,es}.json`) — o build do next-intl valida, mas a verificação é anterior ao build.

## Stress Test *(quando a sprint tocou escrita concorrente ou invariante financeiro)*

- [ ] Cenários concorrentes reais executados (padrão RC-3.8: N usuários simultâneos via `Promise.allSettled` contra MongoDB real, verificando o estado final do banco — não só os retornos).
- [ ] Zero duplicidade, zero perda, zero saldo incorreto — qualquer anomalia = sprint aberta até explicada e corrigida.
- [ ] Scripts de verificação throwaway removidos após o resultado ser documentado; scripts de migração permanecem (`ENGINEERING_STANDARDS.md` §4.2/§5).

---

## Encerramento

O relatório final da sprint termina com esta tabela preenchida:

| Bloco | Aplicável? | Status |
|---|---|---|
| Básicos | sempre | |
| Arquitetura | sim/não + por quê | |
| Performance | sim/não + por quê | |
| Testes | sim/não + por quê | |
| Documentação | sim/não + por quê | |
| Observabilidade | sim/não + por quê | |
| Segurança | sim/não + por quê | |
| UX | sim/não + por quê | |
| Stress Test | sim/não + por quê | |

Sprint encerrada = todos os blocos aplicáveis com status ✔.
